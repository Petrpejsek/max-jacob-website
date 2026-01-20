const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { insertCrawledPage, insertLighthouseReport } = require('../db');

// Configuration
// Spec: keep crawl small + high-signal (home/contact/services/reviews/service-area + top service pages)
const MAX_URLS = 8;
const VIEWPORT_DESKTOP = { width: 1280, height: 720 };
const VIEWPORT_MOBILE = { width: 375, height: 667 };

// URL Blacklist patterns
const BLACKLIST_PATTERNS = [
  /\.pdf$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.png$/i,
  /\.gif$/i,
  /\.svg$/i,
  /\.ico$/i,
  /\.css$/i,
  /\.js$/i,
  /\.woff$/i,
  /\.ttf$/i,
  /\.eot$/i,
  /\/wp-admin\//i,
  /\/wp-content\//i,
  /\/wp-includes\//i,
  /\?s=/i, // Search queries
  /\?replytocom=/i, // Comment replies
  /\?p=/i, // WordPress post IDs
  /[?&]utm_/i, // UTM parameters spam
  /[?&]fbclid=/i, // Facebook click IDs
  /[?&]gclid=/i, // Google click IDs
  /\/feed\//i,
  /\/tag\//i,
  /\/category\//i,
  /\/author\//i,
  /\/page\/\d+/i, // Pagination
  /\/\d{4}\/\d{2}\//i, // Date archives
];

// URL Priority patterns (higher score = higher priority)
const PRIORITY_PATTERNS = [
  { pattern: /\/(contact|get-in-touch|reach-us)/i, score: 100, type: 'contact' },
  { pattern: /\/(services|what-we-do|offerings)/i, score: 90, type: 'services' },
  { pattern: /\/(reviews|testimonials|feedback)/i, score: 80, type: 'reviews' },
  { pattern: /\/(locations|areas-served|service-area)/i, score: 75, type: 'locations' },
  { pattern: /\/(about|team|company)/i, score: 60, type: 'about' },
  { pattern: /\/(pricing|cost|rates)/i, score: 70, type: 'pricing' },
  { pattern: /\/(gallery|projects|portfolio)/i, score: 50, type: 'gallery' },
  { pattern: /\/(faq|questions)/i, score: 40, type: 'faq' },
  { pattern: /\/(blog|news|articles)/i, score: 20, type: 'blog' },
];

// Trust signal patterns
const TRUST_PATTERNS = [
  { pattern: /licensed?/i, type: 'licensed' },
  { pattern: /insured?/i, type: 'insured' },
  { pattern: /certified?/i, type: 'certified' },
  { pattern: /\d+\+?\s*years/i, type: 'years_experience' },
  { pattern: /since\s+\d{4}/i, type: 'established_year' },
  { pattern: /family\s+owned/i, type: 'family_owned' },
  { pattern: /warranty/i, type: 'warranty' },
  { pattern: /guarantee/i, type: 'guarantee' },
  { pattern: /bbb\s+accredited/i, type: 'bbb_accredited' },
  { pattern: /\d+\s*stars?/i, type: 'star_rating' },
  { pattern: /\d+\+?\s*reviews?/i, type: 'review_count' },
];

// US cities list (common cities for NAP detection)
const US_CITIES = [
  'Miami', 'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
  'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver',
  'Boston', 'Portland', 'Las Vegas', 'Detroit', 'Memphis', 'Nashville', 'Baltimore',
  'Orlando', 'Tampa', 'Atlanta', 'Raleigh', 'Sacramento', 'Kansas City'
];

/**
 * Normalize URL for deduplication
 */
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Remove trailing slash, hash, and common query params
    url.hash = '';
    url.searchParams.delete('utm_source');
    url.searchParams.delete('utm_medium');
    url.searchParams.delete('utm_campaign');
    url.searchParams.delete('fbclid');
    url.searchParams.delete('gclid');
    
    let normalized = url.origin + url.pathname;
    // Remove trailing slash unless it's the root
    if (normalized !== url.origin + '/' && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch (err) {
    return urlString;
  }
}

/**
 * Check if URL is blacklisted
 */
function isBlacklisted(url) {
  return BLACKLIST_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Calculate priority score for URL
 */
function calculatePriorityScore(url) {
  for (const { pattern, score, type } of PRIORITY_PATTERNS) {
    if (pattern.test(url)) {
      return { score, type };
    }
  }
  return { score: 10, type: 'other' };
}

/**
 * Discover URLs from page
 */
async function discoverUrlsFromPage(page, baseUrl) {
  const discovered = await page.evaluate((baseOrigin) => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.map(link => {
      const href = link.getAttribute('href');
      if (!href) return null;
      
      try {
        // Handle relative URLs
        const absoluteUrl = new URL(href, window.location.href);
        // Only include same-origin URLs
        if (absoluteUrl.origin === baseOrigin) {
          return absoluteUrl.href;
        }
      } catch (err) {
        // Invalid URL
      }
      return null;
    }).filter(Boolean);
  }, new URL(baseUrl).origin);

  return discovered;
}

/**
 * Extract page data
 */
async function extractPageData(page, url) {
  const data = await page.evaluate(() => {
    // Title and meta
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]');
    const metaDescription = metaDesc ? metaDesc.getAttribute('content') : '';
    const ogSiteNameEl = document.querySelector('meta[property="og:site_name"]');
    const ogSiteName = ogSiteNameEl ? ogSiteNameEl.getAttribute('content') : '';
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const canonicalUrl = canonicalLink ? canonicalLink.getAttribute('href') : '';

    // Headings
    const h1 = document.querySelector('h1');
    const h1Text = h1 ? h1.innerText.trim() : '';
    const h2Elements = Array.from(document.querySelectorAll('h2'))
      .map(el => el.innerText.trim())
      .filter(Boolean)
      .slice(0, 20);
    const h3Elements = Array.from(document.querySelectorAll('h3'))
      .map(el => el.innerText.trim())
      .filter(Boolean)
      .slice(0, 30);
    const h6Elements = Array.from(document.querySelectorAll('h6'))
      .map(el => el.innerText.trim())
      .filter(Boolean)
      .slice(0, 50);

    // Word count (approximate from body text)
    const bodyText = document.body ? document.body.innerText : '';
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

    // Services extraction (cards/blocks)
    // - featured: H3 + short description (nearby p/h6) + learn more link if present
    // - other_services: list items under headings like "Other Services"
    const featured_services = [];
    Array.from(document.querySelectorAll('h3')).slice(0, 30).forEach((h3El, index) => {
      const title = (h3El.innerText || '').trim();
      if (!title || title.length > 80) return;

      const container = h3El.closest('section, article, li, .card, .service, .service-card, .elementor-widget-container, .wp-block-column') || h3El.parentElement;
      const descEl = container
        ? (container.querySelector('h6, p') || null)
        : null;
      const description = descEl ? (descEl.innerText || '').trim().slice(0, 220) : '';

      // Learn more link in the same container
      let learn_more_href = null;
      if (container) {
        const learn = Array.from(container.querySelectorAll('a[href]')).find(a => {
          const t = (a.innerText || '').trim().toLowerCase();
          return t === 'learn more' || t.includes('learn more') || t.includes('details');
        });
        if (learn) {
          learn_more_href = learn.getAttribute('href');
        }
      }

      if (title.length >= 3) {
        featured_services.push({
          title,
          description,
          learn_more_href,
          page_url: window.location.href,
          evidence: {
            selector_or_field: `h3:nth-of-type(${index + 1})`,
            page_url: window.location.href
          }
        });
      }
    });

    const other_services = [];
    const otherServicesHeading = Array.from(document.querySelectorAll('h2, h3, h4'))
      .find(el => ((el.innerText || '').toLowerCase().includes('other services')));
    if (otherServicesHeading) {
      const container = otherServicesHeading.closest('section, article, .elementor-section, .wp-block-group') || otherServicesHeading.parentElement;
      const list = container ? container.querySelector('ul, ol') : null;
      if (list) {
        Array.from(list.querySelectorAll('li')).slice(0, 30).forEach(li => {
          const t = (li.innerText || '').trim();
          if (t && t.length < 120) other_services.push(t);
        });
      }
    }

    // Reviews/testimonials snippet extraction (best-effort)
    const review_snippets = [];
    const testimonialContainers = Array.from(document.querySelectorAll('.testimonial, .testimonials, [class*="testimonial" i], [id*="testimonial" i], blockquote'))
      .slice(0, 10);
    testimonialContainers.forEach((el) => {
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      if (text.length >= 40) {
        review_snippets.push(text.slice(0, 240));
      }
    });

    // Years in business snippet
    let years_in_business_snippet = null;
    const yearsMatch = bodyText.match(/(over\s+)?(\d{1,2})\+?\s*(years?|yrs?)\b/i) || bodyText.match(/since\s+(\d{4})/i);
    if (yearsMatch) {
      years_in_business_snippet = yearsMatch[0].slice(0, 120);
    }

    // Links analysis
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const baseOrigin = window.location.origin;
    
    let internalLinksCount = 0;
    let outboundLinksCount = 0;
    const outboundDomains = {};

    allLinks.forEach(link => {
      try {
        const href = link.getAttribute('href');
        if (!href) return;
        
        const linkUrl = new URL(href, window.location.href);
        
        if (linkUrl.origin === baseOrigin) {
          internalLinksCount++;
        } else if (linkUrl.protocol === 'http:' || linkUrl.protocol === 'https:') {
          outboundLinksCount++;
          const domain = linkUrl.hostname;
          outboundDomains[domain] = (outboundDomains[domain] || 0) + 1;
        }
      } catch (err) {
        // Invalid URL
      }
    });

    // Top outbound domains
    const topOutboundDomains = Object.entries(outboundDomains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    // Forms analysis (Evidence Pack v2 - detailed field analysis)
    const forms = Array.from(document.querySelectorAll('form'));
    const formsCount = forms.length;
    
    const forms_detailed = forms.slice(0, 5).map(form => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
      const fieldsCount = inputs.length;
      const requiredCount = inputs.filter(input => input.required || input.hasAttribute('required')).length;
      const action = form.getAttribute('action') || '';
      const method = form.getAttribute('method') || 'get';
      
      // Extract detailed field information
      const fields = inputs.map(input => {
        const name = input.getAttribute('name') || input.getAttribute('id') || '';
        const type = input.getAttribute('type') || input.tagName.toLowerCase();
        const required = input.required || input.hasAttribute('required');
        
        // Try to find label
        let label = '';
        const id = input.getAttribute('id');
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`);
          if (labelEl) label = labelEl.innerText.trim();
        }
        if (!label && input.placeholder) {
          label = input.placeholder;
        }
        if (!label) {
          // Check if input is inside a label
          const parentLabel = input.closest('label');
          if (parentLabel) label = parentLabel.innerText.trim();
        }
        
        return {
          name: name.slice(0, 50),
          label: label.slice(0, 100),
          type: type.slice(0, 20),
          required
        };
      }).filter(f => f.name || f.label); // Only keep fields with name or label
      
      // Detect specific field types
      const has_phone_field = fields.some(f => 
        /phone|tel|mobile/i.test(f.name) || 
        /phone|tel|mobile/i.test(f.label) || 
        f.type === 'tel'
      );
      const has_email_field = fields.some(f => 
        /email|e-mail/i.test(f.name) || 
        /email|e-mail/i.test(f.label) || 
        f.type === 'email'
      );
      const has_message_field = fields.some(f => 
        /message|comment|question|detail|description/i.test(f.name) || 
        /message|comment|question|detail|description/i.test(f.label) || 
        f.type === 'textarea'
      );
      
      // Find submit button text
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const submit_text = submitBtn ? (submitBtn.innerText || submitBtn.value || '').trim().slice(0, 100) : '';
      
      return {
        fields_count: fieldsCount,
        required_count: requiredCount,
        action: action.slice(0, 100),
        method: method.toLowerCase(),
        fields: fields.slice(0, 20), // Limit to 20 fields
        has_phone_field,
        has_email_field,
        has_message_field,
        submit_text,
        page_url: window.location.href
      };
    });
    
    // Keep old format for backward compatibility
    const formsSummary = forms_detailed.map(f => ({
      fields_count: f.fields_count,
      required_count: f.required_count,
      action: f.action,
      method: f.method
    }));

    // CTA Candidates with Intent Classification (Evidence Pack v2)
    const ctaElements = Array.from(document.querySelectorAll('a, button, input[type="submit"]'))
      .filter(el => {
        const text = (el.innerText || el.value || '').trim();
        // Filter out empty or very long text
        return text.length > 0 && text.length < 100;
      })
      .slice(0, 100); // Limit to 100 CTAs for analysis

    const cta_candidates = ctaElements.map(el => {
      const text = (el.innerText || el.value || '').trim();
      const href = el.tagName === 'A' ? el.getAttribute('href') : null;
      const action = el.tagName === 'FORM' ? el.getAttribute('action') : 
                    (el.form ? el.form.getAttribute('action') : null);
      const rect = el.getBoundingClientRect();
      const is_in_nav = !!el.closest(
        'nav, [role="navigation"], .nav, .navbar, .navbar-nav, .nav-menu, .menu, .main-menu, .primary-menu, .header-menu, .site-nav, .navigation, header nav, header .menu, header .nav-menu, header .navbar'
      );
      
      // Classify CTA intent based on text and href
      let cta_intent = 'other';
      let target_type = 'other';
      
      const textLower = text.toLowerCase();
      const hrefLower = (href || action || '').toLowerCase();
      
      // Intent detection
      if (/\b(call|phone|dial|ring|emergency)\b/i.test(textLower) || hrefLower.startsWith('tel:') || /\b24\/7\b/.test(textLower)) {
        cta_intent = 'call';
        target_type = 'tel';
      } else if (/\b(schedule|book|appointment|calendar)\b/i.test(textLower)) {
        cta_intent = 'schedule';
        target_type = hrefLower.startsWith('http') ? 'external' : 'internal';
      } else if (/\b(quote|estimate|price|pricing|cost)\b/i.test(textLower)) {
        cta_intent = 'quote';
        target_type = hrefLower.startsWith('http') ? 'external' : 'internal';
      } else if (/\b(estimate)\b/i.test(textLower)) {
        cta_intent = 'estimate';
        target_type = hrefLower.startsWith('http') ? 'external' : 'internal';
      } else if (/\b(contact|reach|get in touch|message us|email)\b/i.test(textLower) || hrefLower.startsWith('mailto:')) {
        cta_intent = 'contact';
        target_type = hrefLower.startsWith('mailto:') ? 'mailto' : 
                     (hrefLower.startsWith('http') ? 'external' : 'internal');
      } else if (/\b(book|reserve|reservation)\b/i.test(textLower)) {
        cta_intent = 'book';
        target_type = hrefLower.startsWith('http') ? 'external' : 'internal';
      } else if (el.tagName === 'INPUT' || action) {
        target_type = 'form_submit';
      } else if (hrefLower.startsWith('tel:')) {
        target_type = 'tel';
      } else if (hrefLower.startsWith('mailto:')) {
        target_type = 'mailto';
      } else if (hrefLower.startsWith('http') && !hrefLower.includes(window.location.hostname)) {
        target_type = 'external';
      } else if (hrefLower.startsWith('/') || hrefLower.startsWith(window.location.origin)) {
        target_type = 'internal';
      }
      
      // Above fold detection (desktop 720px, mobile 667px)
      const is_above_fold_desktop = rect.top >= 0 && (rect.top + rect.height / 2) < 720;
      const is_above_fold_mobile = rect.top >= 0 && (rect.top + rect.height / 2) < 667;
      
      // Generate simple selector for debugging
      let dom_debug_selector = el.tagName.toLowerCase();
      if (el.id) dom_debug_selector += `#${el.id}`;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').slice(0, 2).join('.');
        if (classes) dom_debug_selector += `.${classes}`;
      }
      
      return {
        text: text.slice(0, 100),
        href: href ? href.slice(0, 200) : null,
        cta_intent,
        target_type,
        is_in_nav,
        is_above_fold_desktop,
        is_above_fold_mobile,
        page_url: window.location.href,
        dom_debug_selector: dom_debug_selector.slice(0, 100),
        bounding_box: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    });
    
    // Keep old format for backward compatibility
    const ctas = cta_candidates.map(c => ({
      text: c.text,
      href: c.href,
      bounding_box: c.bounding_box
    }));

    // Tel and mailto links
    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
    const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
    const hasTelLink = telLinks.length > 0;
    const hasMailtoLink = mailtoLinks.length > 0;
    const hasForm = formsCount > 0;

    // JSON-LD structured data
    const jsonldBlocks = [];
    const jsonldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonldScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        jsonldBlocks.push(data);
      } catch (e) {
        // Ignore invalid JSON-LD
      }
    });

    return {
      title,
      metaDescription,
      ogSiteName,
      canonicalUrl,
      h1Text,
      h2: h2Elements,
      h3: h3Elements,
      h6: h6Elements,
      wordCount,
      internalLinksCount,
      outboundLinksCount,
      topOutboundDomains,
      formsCount,
      formsSummary,
      forms_detailed, // NEW: Detailed forms with field analysis
      ctas,
      cta_candidates, // NEW: CTA candidates with intent classification
      hasTelLink,
      hasMailtoLink,
      hasForm,
      jsonldBlocks,
      bodyText: bodyText.slice(0, 10000), // First 10k chars for trust signal extraction
      text_snippet: bodyText.slice(0, 4000), // NEW: Text snippet for Evidence Pack v2
      services_extracted: {
        featured: featured_services.slice(0, 20),
        other_services: [...new Set(other_services)].slice(0, 50)
      },
      trust_extracted: {
        years_in_business_snippet,
        review_snippets: review_snippets.slice(0, 6)
      }
    };
  });

  return data;
}

/**
 * Detect CTAs above the fold
 */
function detectCtasAboveFold(ctas, viewportHeight) {
  return ctas.filter(cta => {
    const { top, height } = cta.bounding_box;
    // Consider visible if at least 50% of element is above fold
    return (top + height / 2) < viewportHeight;
  });
}

/**
 * Extract brand assets (logo candidates) with priority scoring
 */
async function extractBrandAssets(page, url) {
  const assets = await page.evaluate(() => {
    const logo_candidates = [];
    
    // Helper function to make URLs absolute
    function makeAbsolute(urlStr) {
      try {
        return new URL(urlStr, window.location.href).href;
      } catch {
        return urlStr;
      }
    }
    
    // Helper function to score logo URL by filename heuristics
    function scoreByFilename(url) {
      const urlLower = url.toLowerCase();
      let score = 0;
      
      // Positive signals
      if (/logo|brand|mark|logotype/i.test(urlLower)) score += 20;
      
      // Negative signals
      if (/hero|banner|background|stock|plumber-van|truck|team|about/i.test(urlLower)) score -= 30;
      
      return score;
    }
    
    // Helper function to penalize by dimensions
    function penalizeByDimensions(width, height) {
      let penalty = 0;
      if (width > 1500 || height > 800) penalty -= 40;
      return penalty;
    }
    
    // 1. Extract from JSON-LD (Organization.logo or LocalBusiness.image)
    const jsonldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonldScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        const expandItems = (block) => {
          if (!block) return [];
          if (Array.isArray(block)) return block.flatMap(expandItems);
          if (block['@graph'] && Array.isArray(block['@graph'])) return block['@graph'];
          return [block];
        };
        const items = expandItems(data);
        
        items.forEach(item => {
          const rawType = item['@type'];
          const types = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : []);
          const isOrg = types.includes('Organization');
          const isLocalish = types.includes('LocalBusiness') || types.some(t => /Plumber|PlumbingService|HomeAndConstructionBusiness|ProfessionalService|LocalBusiness/i.test(String(t)));

          // Organization logo
          if (isOrg && item.logo) {
            const logoUrl = typeof item.logo === 'string' ? item.logo : 
                           (item.logo.url || item.logo['@url']);
            if (logoUrl) {
              logo_candidates.push({
                url: makeAbsolute(logoUrl),
                source: 'jsonld_org_logo',
                type: 'logo',
                format: logoUrl.endsWith('.svg') ? 'svg' : 
                       logoUrl.endsWith('.png') ? 'png' :
                       logoUrl.endsWith('.jpg') || logoUrl.endsWith('.jpeg') ? 'jpg' : 'unknown',
                width: item.logo.width || null,
                height: item.logo.height || null,
                evidence: {
                  selector_or_field: 'Organization.logo',
                  page_url: window.location.href
                },
                priority_score: 100 + scoreByFilename(logoUrl)
              });
            }
          }
          
          // LocalBusiness image (only if looks like logo, not a photo)
          if (isLocalish && item.image) {
            const imageUrl = typeof item.image === 'string' ? item.image :
                            (item.image.url || item.image['@url']);
            if (imageUrl && (/logo|brand/i.test(imageUrl))) {
              logo_candidates.push({
                url: makeAbsolute(imageUrl),
                source: 'jsonld_localbusiness_image',
                type: 'logo',
                format: imageUrl.endsWith('.svg') ? 'svg' : 
                       imageUrl.endsWith('.png') ? 'png' :
                       imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg') ? 'jpg' : 'unknown',
                width: item.image.width || null,
                height: item.image.height || null,
                evidence: {
                  selector_or_field: 'LocalBusiness.image',
                  page_url: window.location.href
                },
                priority_score: 90 + scoreByFilename(imageUrl)
              });
            }
          }
        });
      } catch (e) {
        // Invalid JSON-LD
      }
    });
    
    // 2. Extract from header logo (DOM)
    const headerEl = document.querySelector('header, .header, nav, .nav, .top-bar');
    if (headerEl) {
      // Look for images with logo in alt/class/id
      const logoImgs = headerEl.querySelectorAll('img[alt*="logo" i], img[class*="logo" i], img[id*="logo" i], .logo img, #logo img');
      logoImgs.forEach(img => {
        if (img.src && img.src.startsWith('http')) {
          const width = img.naturalWidth || img.width || null;
          const height = img.naturalHeight || img.height || null;
          logo_candidates.push({
            url: img.src,
            source: 'header_img',
            type: 'logo',
            format: img.src.endsWith('.svg') ? 'svg' :
                   img.src.endsWith('.png') ? 'png' :
                   img.src.endsWith('.jpg') || img.src.endsWith('.jpeg') ? 'jpg' : 'unknown',
            width,
            height,
            evidence: {
              selector_or_field: img.alt || img.className || 'header img',
              page_url: window.location.href
            },
            priority_score: 85 + scoreByFilename(img.src) + penalizeByDimensions(width, height) + (img.src.endsWith('.svg') ? 10 : 0)
          });
        }
      });
      
      // Look for SVG logos in header
      const logoSvgs = headerEl.querySelectorAll('svg[class*="logo" i], svg[id*="logo" i], .logo svg, #logo svg');
      logoSvgs.forEach((svg, index) => {
        // Try to extract SVG as data URL or find linked SVG
        logo_candidates.push({
          url: `inline-svg-${index}`,
          source: 'header_svg',
          type: 'logo',
          format: 'svg',
          width: svg.width ? svg.width.baseVal.value : null,
          height: svg.height ? svg.height.baseVal.value : null,
          evidence: {
            selector_or_field: svg.className || svg.id || 'header svg',
            page_url: window.location.href
          },
          priority_score: 90 // SVG is high priority
        });
      });
    }
    
    // 3. Extract from OG image (often hero banner, lower priority)
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const ogUrl = ogImage.getAttribute('content');
      if (ogUrl) {
        logo_candidates.push({
          url: makeAbsolute(ogUrl),
          source: 'og_image',
          type: 'og_image',
          format: ogUrl.endsWith('.png') ? 'png' :
                 ogUrl.endsWith('.jpg') || ogUrl.endsWith('.jpeg') ? 'jpg' : 'unknown',
          width: null,
          height: null,
          evidence: {
            selector_or_field: 'meta[property="og:image"]',
            page_url: window.location.href
          },
          priority_score: 40 + scoreByFilename(ogUrl)
        });
      }
    }
    
    // 4. Extract from apple-touch-icon
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) {
      const iconUrl = appleTouchIcon.getAttribute('href');
      if (iconUrl) {
        logo_candidates.push({
          url: makeAbsolute(iconUrl),
          source: 'apple_touch_icon',
          type: 'icon',
          format: iconUrl.endsWith('.png') ? 'png' : 'unknown',
          width: null,
          height: null,
          evidence: {
            selector_or_field: 'link[rel="apple-touch-icon"]',
            page_url: window.location.href
          },
          priority_score: 30
        });
      }
    }
    
    // 5. Extract from favicon
    const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (favicon) {
      const faviconUrl = favicon.getAttribute('href');
      if (faviconUrl) {
        logo_candidates.push({
          url: makeAbsolute(faviconUrl),
          source: 'favicon',
          type: 'icon',
          format: faviconUrl.endsWith('.ico') ? 'ico' :
                 faviconUrl.endsWith('.png') ? 'png' : 'unknown',
          width: null,
          height: null,
          evidence: {
            selector_or_field: 'link[rel="icon"]',
            page_url: window.location.href
          },
          priority_score: 20
        });
      }
    }
    
    return { logo_candidates };
  });
  
  return assets;
}

/**
 * Extract trust signals from text
 */
function extractTrustSignals(bodyText) {
  const signals = [];
  
  TRUST_PATTERNS.forEach(({ pattern, type }) => {
    const matches = bodyText.match(pattern);
    if (matches) {
      signals.push({
        type,
        text: matches[0].slice(0, 100),
        source: 'body_text'
      });
    }
  });

  return signals;
}

/**
 * Extract NAP (Name, Address, Phone) from text and structured data
 */
function extractNAP(bodyText, jsonldBlocks) {
  const nap = {
    name: null,
    address: null,
    phone: null
  };

  // Try JSON-LD first
  jsonldBlocks.forEach(block => {
    if (block['@type'] === 'LocalBusiness' || block['@type'] === 'Organization') {
      if (!nap.name && block.name) {
        nap.name = block.name.slice(0, 100);
      }
      if (!nap.phone && block.telephone) {
        nap.phone = block.telephone.slice(0, 30);
      }
      if (!nap.address && block.address) {
        if (typeof block.address === 'string') {
          nap.address = block.address.slice(0, 200);
        } else if (block.address.streetAddress) {
          const parts = [
            block.address.streetAddress,
            block.address.addressLocality,
            block.address.addressRegion,
            block.address.postalCode
          ].filter(Boolean);
          nap.address = parts.join(', ').slice(0, 200);
        }
      }
    }
  });

  // Phone from body text (US format)
  if (!nap.phone) {
    const phoneMatch = bodyText.match(/(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) {
      nap.phone = phoneMatch[0].slice(0, 30);
    }
  }

  // Address from body text (US format)
  if (!nap.address) {
    const addressMatch = bodyText.match(/\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)[.,\s]+[\w\s]+,?\s+[A-Z]{2}\s+\d{5}/i);
    if (addressMatch) {
      nap.address = addressMatch[0].slice(0, 200);
    }
  }

  return nap;
}

/**
 * Extract cities mentioned in text
 */
function extractCities(bodyText) {
  const citiesFound = [];
  
  US_CITIES.forEach(city => {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(bodyText)) {
      citiesFound.push(city);
    }
  });

  return [...new Set(citiesFound)].slice(0, 10); // Dedupe and limit to 10
}

/**
 * Normalize JSON-LD data into flat, extracted structure for Evidence Pack v2
 */
function normalizeJsonLd(jsonldBlocks) {
  const extracted = {
    organization: {
      name: null,
      logo: null,
      sameAs: [],
      contactPoint: {
        telephone: null,
        url: null
      }
    },
    website: {
      name: null
    },
    localbusiness: {
      name: null,
      telephone: null,
      address: null,
      geo: null,
      hasMap: null,
      openingHoursSpecification: null,
      aggregateRating: null,
      areaServed: []
    },
    offer_catalog_services: []
  };
  
  if (!jsonldBlocks || jsonldBlocks.length === 0) {
    return extracted;
  }
  
  const expandItems = (block) => {
    if (!block) return [];
    if (Array.isArray(block)) return block.flatMap(expandItems);
    if (block['@graph'] && Array.isArray(block['@graph'])) return block['@graph'];
    return [block];
  };

  jsonldBlocks.forEach(block => {
    const items = expandItems(block);
    items.forEach(item => {
      const rawType = item['@type'];
      const types = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : []);
      const hasType = (t) => types.includes(t);
      const isOrg = hasType('Organization');
      const isWebsite = hasType('WebSite');
      const isLocalish = hasType('LocalBusiness') || types.some(t => /Plumber|PlumbingService|HomeAndConstructionBusiness|ProfessionalService|LocalBusiness/i.test(String(t)));
      
      // Extract Organization data
      if (isOrg) {
        if (!extracted.organization.name && item.name) {
          extracted.organization.name = item.name;
        }
        if (!extracted.organization.logo && item.logo) {
          // Handle logo as string, object with url/contentUrl, or ImageObject
          if (typeof item.logo === 'string') {
            extracted.organization.logo = item.logo;
          } else if (item.logo.url) {
            extracted.organization.logo = item.logo.url;
          } else if (item.logo.contentUrl) {
            extracted.organization.logo = item.logo.contentUrl;
          } else if (item.logo['@url']) {
            extracted.organization.logo = item.logo['@url'];
          }
        }
        if (item.sameAs) {
          const sameAsArray = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
          extracted.organization.sameAs = [...new Set([...extracted.organization.sameAs, ...sameAsArray])];
        }
        if (item.contactPoint) {
          const cp = Array.isArray(item.contactPoint) ? item.contactPoint[0] : item.contactPoint;
          if (cp.telephone) extracted.organization.contactPoint.telephone = cp.telephone;
          if (cp.url) extracted.organization.contactPoint.url = cp.url;
        }
      }

      // Extract WebSite data
      if (isWebsite) {
        if (!extracted.website.name && item.name) {
          extracted.website.name = item.name;
        }
      }
      
      // Extract LocalBusiness data
      if (isLocalish) {
        if (!extracted.localbusiness.name && item.name) {
          extracted.localbusiness.name = item.name;
        }
        if (!extracted.localbusiness.telephone && (item.telephone || item.telePhone)) {
          extracted.localbusiness.telephone = item.telephone || item.telePhone;
        }
        if (!extracted.localbusiness.address && item.address) {
          if (typeof item.address === 'string') {
            extracted.localbusiness.address = { full: item.address };
          } else {
            extracted.localbusiness.address = {
              streetAddress: item.address.streetAddress || null,
              addressLocality: item.address.addressLocality || null,
              addressRegion: item.address.addressRegion || null,
              postalCode: item.address.postalCode || null,
              addressCountry: item.address.addressCountry || null
            };
          }
        }
        if (!extracted.localbusiness.geo && item.geo) {
          extracted.localbusiness.geo = {
            latitude: item.geo.latitude || null,
            longitude: item.geo.longitude || null
          };
        }
        if (!extracted.localbusiness.hasMap && item.hasMap) {
          extracted.localbusiness.hasMap = item.hasMap;
        }
        if (!extracted.localbusiness.openingHoursSpecification && item.openingHoursSpecification) {
          extracted.localbusiness.openingHoursSpecification = item.openingHoursSpecification;
        }
        if (!extracted.localbusiness.openingHoursSpecification && item.openingHours) {
          // Some sites provide openingHours as array/string; keep as-is for later parsing
          extracted.localbusiness.openingHoursSpecification = item.openingHours;
        }
        if (!extracted.localbusiness.aggregateRating && item.aggregateRating) {
          extracted.localbusiness.aggregateRating = {
            ratingValue: item.aggregateRating.ratingValue || null,
            reviewCount: item.aggregateRating.reviewCount || null,
            bestRating: item.aggregateRating.bestRating || null,
            worstRating: item.aggregateRating.worstRating || null
          };
        }
        if (item.areaServed) {
          const areasArray = Array.isArray(item.areaServed) ? item.areaServed : [item.areaServed];
          const areaNames = areasArray.map(a => typeof a === 'string' ? a : a.name).filter(Boolean);
          extracted.localbusiness.areaServed = [...new Set([...extracted.localbusiness.areaServed, ...areaNames])];
        }
        
        // Extract hasOfferCatalog services
        if (item.hasOfferCatalog) {
          const catalog = Array.isArray(item.hasOfferCatalog) ? item.hasOfferCatalog[0] : item.hasOfferCatalog;
          if (catalog.itemListElement) {
            const services = catalog.itemListElement.map(service => {
              return service.name || service.itemOffered?.name || null;
            }).filter(Boolean);
            extracted.offer_catalog_services = [...new Set([...extracted.offer_catalog_services, ...services])];
          }
        }
      }
    });
  });
  
  // Limit services to top 12
  extracted.offer_catalog_services = extracted.offer_catalog_services.slice(0, 12);
  
  // Limit areaServed to top 10
  extracted.localbusiness.areaServed = extracted.localbusiness.areaServed.slice(0, 10);
  
  // Limit sameAs to top 10
  extracted.organization.sameAs = extracted.organization.sameAs.slice(0, 10);
  
  return extracted;
}

/**
 * Take screenshots for a page
 */
async function takeScreenshots(page, url, jobId, pageIndex) {
  const screenshotDir = path.join(__dirname, '..', '..', 'public', 'audit_screenshots', String(jobId), 'pages');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const screenshots = {};

  try {
    // Desktop above-the-fold
    await page.setViewportSize(VIEWPORT_DESKTOP);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000); // Wait for content to settle
    
    const desktopAboveFoldPath = path.join(screenshotDir, `page${pageIndex}-desktop-above-fold.png`);
    await page.screenshot({ path: desktopAboveFoldPath, fullPage: false });
    screenshots.desktop_above_fold = `public/audit_screenshots/${jobId}/pages/page${pageIndex}-desktop-above-fold.png`;

    // Desktop full page
    const desktopFullPath = path.join(screenshotDir, `page${pageIndex}-desktop-full.png`);
    await page.screenshot({ path: desktopFullPath, fullPage: true });
    screenshots.desktop_full = `public/audit_screenshots/${jobId}/pages/page${pageIndex}-desktop-full.png`;

    // Mobile above-the-fold
    await page.setViewportSize(VIEWPORT_MOBILE);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const mobileAboveFoldPath = path.join(screenshotDir, `page${pageIndex}-mobile-above-fold.png`);
    await page.screenshot({ path: mobileAboveFoldPath, fullPage: false });
    screenshots.mobile_above_fold = `public/audit_screenshots/${jobId}/pages/page${pageIndex}-mobile-above-fold.png`;

  } catch (err) {
    console.error(`[SCRAPER V3] Screenshot error for ${url}:`, err.message);
  }

  return screenshots;
}

/**
 * Run Lighthouse audit for a URL
 */
async function runLighthouseAudit(url, jobId, crawledPageId, pageType, logFn) {
  try {
    // Try to load Lighthouse (optional dependency)
    let lighthouse, chromeLauncher;
    try {
      lighthouse = require('lighthouse');
      chromeLauncher = require('chrome-launcher');
    } catch (requireErr) {
      await logFn(jobId, 'lighthouse', `Lighthouse not available (npm install lighthouse chrome-launcher to enable)`);
      return null;
    }

    await logFn(jobId, 'lighthouse', `Running Lighthouse for ${url}`);

    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port
    };

    const runnerResult = await lighthouse(url, options);
    await chrome.kill();

    if (!runnerResult || !runnerResult.lhr) {
      throw new Error('Lighthouse returned no results');
    }

    const lhr = runnerResult.lhr;
    const categories = lhr.categories || {};
    const audits = lhr.audits || {};

    const reportData = {
      performance_score: categories.performance ? categories.performance.score * 100 : null,
      accessibility_score: categories.accessibility ? categories.accessibility.score * 100 : null,
      best_practices_score: categories['best-practices'] ? categories['best-practices'].score * 100 : null,
      seo_score: categories.seo ? categories.seo.score * 100 : null,
      fcp: audits['first-contentful-paint'] ? audits['first-contentful-paint'].numericValue : null,
      lcp: audits['largest-contentful-paint'] ? audits['largest-contentful-paint'].numericValue : null,
      cls: audits['cumulative-layout-shift'] ? audits['cumulative-layout-shift'].numericValue : null,
      tti: audits['interactive'] ? audits['interactive'].numericValue : null,
      report_json: {
        categories: categories,
        audits_summary: {
          fcp: audits['first-contentful-paint'],
          lcp: audits['largest-contentful-paint'],
          cls: audits['cumulative-layout-shift'],
          tti: audits['interactive'],
          tbt: audits['total-blocking-time'],
          speed_index: audits['speed-index']
        }
      }
    };

    return reportData;
  } catch (err) {
    console.error(`[LIGHTHOUSE] Error for ${url}:`, err.message);
    await logFn(jobId, 'lighthouse', `Lighthouse failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Main crawler function
 */
async function crawlWebsite(jobId, startUrl, logFn) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT_DESKTOP });
  
  const baseUrl = new URL(startUrl);
  const baseOrigin = baseUrl.origin;

  // URL queue (priority queue)
  const urlQueue = [];
  const visited = new Set();
  const crawledPages = [];

  // Add start URL to queue
  const startNormalized = normalizeUrl(startUrl);
  urlQueue.push({
    url: startUrl,
    normalized: startNormalized,
    priority: 1000, // Homepage has highest priority
    type: 'home'
  });

  await logFn(jobId, 'crawler', `Starting crawl from ${startUrl} (max ${MAX_URLS} pages)`);

  while (urlQueue.length > 0 && crawledPages.length < MAX_URLS) {
    // Sort queue by priority (highest first)
    urlQueue.sort((a, b) => b.priority - a.priority);
    
    const current = urlQueue.shift();
    
    // Skip if already visited
    if (visited.has(current.normalized)) {
      continue;
    }
    
    visited.add(current.normalized);
    
    await logFn(jobId, 'crawler', `Crawling [${crawledPages.length + 1}/${MAX_URLS}]: ${current.url} (type: ${current.type})`);

    try {
      const page = await context.newPage();
      await page.goto(current.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Extract page data
      const pageData = await extractPageData(page, current.url);
      
      // Detect above-the-fold CTAs
      const navBlacklist = new Set(['home', 'services', 'about']);
      const ctasAboveFold = (pageData.cta_candidates || [])
        .filter(c => c && c.text && (c.is_above_fold_desktop || c.is_above_fold_mobile))
        .filter(c => !c.is_in_nav)
        .filter(c => !navBlacklist.has(String(c.text).trim().toLowerCase()))
        .slice(0, 20)
        .map(c => ({ text: c.text, href: c.href, bounding_box: c.bounding_box }));
      
      // Extract trust signals
      const trustSignals = extractTrustSignals(pageData.bodyText);
      
      // Extract NAP
      const nap = extractNAP(pageData.bodyText, pageData.jsonldBlocks);
      
      // Extract cities
      const cities = extractCities(pageData.bodyText);
      
      // Extract brand assets (logo candidates)
      const brandAssets = await extractBrandAssets(page, current.url);
      
      // Normalize JSON-LD data
      const jsonldExtracted = normalizeJsonLd(pageData.jsonldBlocks);
      
      // Take screenshots (only for first 5 pages to save storage)
      let screenshots = {};
      if (crawledPages.length < 5) {
        screenshots = await takeScreenshots(page, current.url, jobId, crawledPages.length);
      }
      
      // Discover new URLs from this page
      const discoveredUrls = await discoverUrlsFromPage(page, current.url);
      
      // Close page
      await page.close();
      
      // Add page to crawled list
      crawledPages.push({
        url: current.url,
        normalized_url: current.normalized,
        page_type: current.type,
        priority_score: current.priority,
        title: pageData.title,
        og_site_name: pageData.ogSiteName,
        meta_description: pageData.metaDescription,
        canonical_url: pageData.canonicalUrl,
        h1_text: pageData.h1Text,
        h2_json: pageData.h2,
        h3_json: pageData.h3,
        h6_json: pageData.h6,
        word_count: pageData.wordCount,
        internal_links_count: pageData.internalLinksCount,
        outbound_links_count: pageData.outboundLinksCount,
        top_outbound_domains_json: pageData.topOutboundDomains,
        forms_count: pageData.formsCount,
        forms_summary_json: pageData.formsSummary,
        forms_detailed_json: pageData.forms_detailed, // Detailed forms with field analysis
        ctas_json: pageData.ctas,
        cta_candidates_json: pageData.cta_candidates, // NEW: CTA candidates with intent
        ctas_above_fold_json: ctasAboveFold,
        has_tel_link: pageData.hasTelLink,
        has_mailto_link: pageData.hasMailtoLink,
        has_form: pageData.hasForm,
        trust_signals_json: trustSignals,
        trust_extracted_json: pageData.trust_extracted || {},
        nap_json: nap,
        cities_json: cities,
        jsonld_blocks_json: pageData.jsonldBlocks,
        jsonld_extracted_json: jsonldExtracted, // NEW: Normalized JSON-LD for Evidence Pack v2
        services_extracted_json: pageData.services_extracted || {},
        brand_assets_json: brandAssets, // NEW: Logo candidates with priority scoring
        text_snippet: pageData.text_snippet, // NEW: Text snippet for Evidence Pack v2
        screenshots_json: screenshots
      });
      
      // Process discovered URLs
      discoveredUrls.forEach(url => {
        const normalized = normalizeUrl(url);
        
        // Skip if blacklisted, already visited, or already in queue
        if (isBlacklisted(url) || visited.has(normalized) || urlQueue.some(u => u.normalized === normalized)) {
          return;
        }
        
        // Calculate priority
        const { score, type } = calculatePriorityScore(url);
        
        urlQueue.push({
          url,
          normalized,
          priority: score,
          type
        });
      });
      
    } catch (err) {
      await logFn(jobId, 'crawler', `Error crawling ${current.url}: ${err.message}`);
      console.error(`[CRAWLER] Error:`, err);
    }
  }

  await browser.close();
  
  await logFn(jobId, 'crawler', `Crawl complete: ${crawledPages.length} pages processed`);
  
  return crawledPages;
}

/**
 * Run Lighthouse audits for top pages
 */
async function runLighthouseAudits(jobId, crawledPages, logFn) {
  await logFn(jobId, 'lighthouse', 'Starting Lighthouse audits for top 3 pages');
  
  // Select top 3 pages: home, contact, best service page
  const homePage = crawledPages.find(p => p.page_type === 'home');
  const contactPage = crawledPages.find(p => p.page_type === 'contact');
  const servicePage = crawledPages.find(p => p.page_type === 'services');
  
  const pagesToAudit = [homePage, contactPage, servicePage].filter(Boolean).slice(0, 3);
  
  if (pagesToAudit.length === 0) {
    await logFn(jobId, 'lighthouse', 'No suitable pages found for Lighthouse audit');
    return [];
  }
  
  const lighthouseResults = [];
  
  for (const page of pagesToAudit) {
    const result = await runLighthouseAudit(page.url, jobId, page.id, page.page_type, logFn);
    if (result) {
      lighthouseResults.push({
        audit_job_id: jobId,
        crawled_page_id: page.id,
        url: page.url,
        page_type: page.page_type,
        ...result
      });
    }
  }
  
  return lighthouseResults;
}

module.exports = {
  crawlWebsite,
  runLighthouseAudits
};

