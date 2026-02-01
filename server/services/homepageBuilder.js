const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const crypto = require('crypto');
const { getPersistentPublicDir } = require('../runtimePaths');
const {
  normalizeCompanyNameCandidate,
  isLikelyBusinessName,
  deriveDomainFallbackName,
} = require('../helpers/companyName');

/**
 * Homepage Builder Service
 * 
 * Generates dynamic homepage proposals from scraped website data.
 * Uses EJS templates with scraped content (menu, services, NAP, logo)
 * and hardcoded images/reviews with variable replacement.
 */

/**
 * Build template data from audit job and crawled pages
 * @param {Object} job - Audit job with all data
 * @param {Array} crawledPages - Array of crawled pages
 * @returns {Object} Template data for rendering
 */
async function buildTemplateData(job, crawledPages) {
  console.log(`[HOMEPAGE BUILDER] Building template data for job ${job.id}`);
  
  // Find homepage
  const homepage = crawledPages.find(p => p.page_type === 'home') || crawledPages[0];
  
  if (!homepage) {
    throw new Error('No homepage found in crawled pages');
  }

  // Extract data from various sources
  const llmContext = job.llm_context_json || {};
  const companyProfile = llmContext.company_profile || {};
  const servicesData = llmContext.services || {};
  
  // 1. Branding
  const branding = await buildBranding(homepage, job, companyProfile);
  
  // 2. Menu structure
  const menu = extractMenuStructure(homepage.nav_primary_json);
  
  // 3. Services
  const services = extractServices(crawledPages, servicesData, job);
  
  // 4. NAP (Name, Address, Phone)
  const nap = extractNAP(crawledPages, companyProfile, job);
  
  // 5. Trust signals
  const trust = extractTrustSignals(homepage, llmContext);
  
  // 6. Footer links
  const footer = extractFooter(homepage);
  
  // 7. Service area cities
  const serviceArea = extractServiceArea(crawledPages, job);
  
  // 8. Review variables for replacement
  const reviewVars = buildReviewVariables(job, companyProfile, services);
  
  const data = {
    branding,
    menu,
    services,
    nap,
    trust,
    footer,
    serviceArea,
    reviewVars,
    job: {
      id: job.id,
      niche: job.niche,
      city: job.city
    },
    warnings: []
  };
  
  // Add warnings for missing critical data
  if (!branding.logo_url || branding.logo_url === '/public/preset-templates/shared/placeholder-logo.png') {
    data.warnings.push('Logo not found - using placeholder');
  }
  if (menu.length === 0) {
    data.warnings.push('Menu structure not found - using defaults');
  }
  if (services.length === 0) {
    data.warnings.push('Services not found - using generic examples');
  }
  if (nap && nap.phone_source === 'placeholder') {
    data.warnings.push('Phone number not found - using placeholder');
  }
  
  console.log(`[HOMEPAGE BUILDER] Template data built with ${data.warnings.length} warnings`);
  
  return data;
}

/**
 * Build branding data (logo, company name)
 */
async function buildBranding(homepage, job, companyProfile) {
  const brandAssets = homepage.brand_assets_json || {};
  const logo = await selectBestLogo(brandAssets, job.id);
  
  // Company name priority: scraped JSON-LD/nap > LLM context > job.company_name > domain
  const jsonld = homepage.jsonld_extracted_json || {};
  const scrapedName =
    (jsonld.organization && jsonld.organization.name) ||
    (jsonld.localbusiness && jsonld.localbusiness.name) ||
    (homepage.nap_json && homepage.nap_json.name) ||
    null;

  const rawCompanyName = scrapedName || companyProfile.name || job.company_name;
  const normalized = normalizeCompanyNameCandidate(rawCompanyName);
  let companyName = (normalized && isLikelyBusinessName(normalized)) ? normalized : null;
  
  if (!companyName && job.input_url) {
    companyName = deriveDomainFallbackName(job.input_url);
    if (!companyName) {
      try {
        const url = new URL(job.input_url);
        companyName = url.hostname.replace('www.', '').replace(/\.[^.]+$/, '');
        companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
      } catch (e) {
        companyName = 'Your Company';
      }
    }
  }
  
  return {
    logo_url: logo.url,
    logo_source: logo.source,
    company_name: companyName
  };
}

/**
 * Select best logo from brand assets and download it locally
 */
async function selectBestLogo(brandAssets, jobId) {
  const candidates = brandAssets.logo_candidates || [];
  
  if (candidates.length === 0) {
    console.log('[HOMEPAGE BUILDER] No logo candidates found, using placeholder');
    return {
      url: '/public/preset-templates/shared/placeholder-logo.png',
      source: 'placeholder',
      stored: false
    };
  }
  
  // Sort by priority score (highest first)
  const sorted = candidates.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  
  // Filter out likely hero images (too large)
  const filtered = sorted.filter(c => {
    if (c.width && c.height) {
      return c.width <= 1500 && c.height <= 800;
    }
    return true;
  });
  
  const bestLogo = filtered[0] || sorted[0];
  
  console.log(`[HOMEPAGE BUILDER] Selected logo: ${bestLogo.source} (priority: ${bestLogo.priority_score})`);
  
  // Download and store logo locally
  if (bestLogo.url && bestLogo.url.startsWith('http')) {
    try {
      const storedPath = await downloadAndStoreAsset(bestLogo.url, jobId, 'logo');
      return {
        url: storedPath,
        source: bestLogo.source,
        stored: true,
        original_url: bestLogo.url
      };
    } catch (err) {
      console.error('[HOMEPAGE BUILDER] Failed to download logo:', err.message);
      return {
        url: bestLogo.url,
        source: bestLogo.source,
        stored: false
      };
    }
  }
  
  return {
    url: bestLogo.url || '/public/preset-templates/shared/placeholder-logo.png',
    source: bestLogo.source || 'placeholder',
    stored: false
  };
}

/**
 * Download asset and store locally
 */
async function downloadAndStoreAsset(url, jobId, type = 'asset') {
  const assetsDir = path.join(getPersistentPublicDir(), 'audit_screenshots', String(jobId), 'assets');
  
  // Ensure directory exists
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  
  // Determine file extension
  let ext = path.extname(new URL(url).pathname) || '.png';
  if (!ext.match(/\.(png|jpg|jpeg|svg|webp|gif)$/i)) {
    ext = '.png';
  }
  
  // Generate filename
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  const filename = `${type}-${hash}${ext}`;
  const filePath = path.join(assetsDir, filename);
  
  // Download if not already cached
  if (!fs.existsSync(filePath)) {
    console.log(`[HOMEPAGE BUILDER] Downloading ${type}: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MaxAndJacob-Audit/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download ${type}: ${response.status}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    console.log(`[HOMEPAGE BUILDER] Saved ${type} to ${filePath}`);
  }
  
  // Return relative path for use in HTML
  return `/public/audit_screenshots/${jobId}/assets/${filename}`;
}

/**
 * Extract menu structure from scraped nav data
 */
function extractMenuStructure(navData) {
  if (!navData || !Array.isArray(navData) || navData.length === 0) {
    console.log('[HOMEPAGE BUILDER] No nav data, using default menu');
    return [
      { text: 'Home', url: '#home' },
      { text: 'Services', url: '#services' },
      { text: 'About', url: '#about' },
      { text: 'Contact', url: '#contact' }
    ];
  }
  
  // Extract top-level menu items (flatten nested structure)
  const menuItems = navData.map(item => ({
    text: item.text || 'Menu Item',
    url: item.url || item.href || '#',
    children: (item.children || []).map(child => ({
      text: child.text || 'Submenu',
      url: child.url || child.href || '#'
    }))
  }));
  
  // Limit to 6 main menu items
  return menuItems.slice(0, 6);
}

/**
 * Extract services from scraped data
 */
function extractServices(pagesOrHomepage, servicesData, job) {
  const pages = Array.isArray(pagesOrHomepage) ? pagesOrHomepage : [pagesOrHomepage].filter(Boolean);
  const homepage = pages.find(p => p && p.page_type === 'home') || pages[0] || {};
  const servicesPage = pages.find(p => p && p.page_type === 'services') || null;

  const out = [];
  const seen = new Set();

  const pushService = (title, description = '', learn_more_href = null) => {
    const t = String(title || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      title: t.slice(0, 80),
      description: String(description || '').trim().slice(0, 220),
      learn_more_href: learn_more_href || null
    });
  };

  const addFromFeatured = (featured) => {
    (Array.isArray(featured) ? featured : []).forEach((service) => {
      if (!service) return;
      pushService(service.title, service.description, service.learn_more_href);
    });
  };

  // Priority: real scrape data first (home + services page)
  addFromFeatured(homepage.services_extracted_json && homepage.services_extracted_json.featured);
  if (servicesPage) addFromFeatured(servicesPage.services_extracted_json && servicesPage.services_extracted_json.featured);

  // JSON-LD offer catalog services (across pages)
  pages.forEach((p) => {
    const jsonld = p && p.jsonld_extracted_json ? p.jsonld_extracted_json : {};
    const offerServices = (jsonld && Array.isArray(jsonld.offer_catalog_services)) ? jsonld.offer_catalog_services : [];
    offerServices.slice(0, 20).forEach((name) => pushService(name));
  });

  // LLM context services as last "real" source (still derived from scrape, but lower trust)
  const llmFeatured = (servicesData && Array.isArray(servicesData.featured)) ? servicesData.featured : [];
  llmFeatured.slice(0, 12).forEach((s) => {
    if (typeof s === 'string') pushService(s);
    else if (s && (s.title || s.name)) pushService(s.title || s.name, s.description || '');
  });

  if (out.length === 0) {
    console.log('[HOMEPAGE BUILDER] No services found, using generic examples');
    const niche = (job && job.niche) ? String(job.niche).toLowerCase() : '';
    if (niche.includes('plumb')) {
      return [
        { title: 'Drain Cleaning', description: '' },
        { title: 'Water Heater Repair', description: '' },
        { title: 'Leak Detection', description: '' },
        { title: 'Sewer Line Repair', description: '' },
        { title: 'Fixture Installation', description: '' },
        { title: '24/7 Emergency Plumbing', description: '' }
      ];
    }
    return [
      { title: 'Professional Service', description: '' },
      { title: 'Expert Solutions', description: '' },
      { title: 'Reliable Support', description: '' },
      { title: 'Fast Response', description: '' },
      { title: 'Local Specialists', description: '' },
      { title: 'Emergency Help', description: '' }
    ];
  }

  return out.slice(0, 6);
}

/**
 * Extract NAP (Name, Address, Phone) data
 */
function extractNAP(pagesOrHomepage, companyProfile, job) {
  const pages = Array.isArray(pagesOrHomepage) ? pagesOrHomepage : [pagesOrHomepage].filter(Boolean);
  const homepage = pages.find(p => p && p.page_type === 'home') || pages[0] || {};
  const contactPage = pages.find(p => p && p.page_type === 'contact') || null;

  // Prefer contact page for NAP details, then homepage, then anything else
  const orderedPages = []
    .concat(contactPage ? [contactPage] : [])
    .concat(homepage ? [homepage] : [])
    .concat(pages.filter(p => p && p !== contactPage && p !== homepage));

  const placeholders = {
    phone: '(555) 555-0123',
    email: 'hello@example.com',
    hours: 'Mon–Fri 8am–6pm',
    address: `123 Main St, ${(job && job.city) ? job.city : 'Your City'}, ST 00000`
  };

  const cleanPhoneFromHref = (href) => {
    const raw = String(href || '').trim();
    if (!raw) return null;
    let v = raw.replace(/^(tel:|sms:|smsto:)/i, '');
    v = v.split(/[?;]/)[0].trim();
    const digits = v.replace(/[^\d]/g, '');
    if (digits.length < 7) return null;
    return v.slice(0, 40);
  };

  const cleanEmailFromHref = (href) => {
    const raw = String(href || '').trim();
    if (!raw) return null;
    let v = raw.replace(/^mailto:/i, '').trim();
    v = v.split('?')[0].trim();
    if (!v.includes('@')) return null;
    return v.slice(0, 140);
  };

  const extractEmailFromText = (t) => {
    const s = String(t || '');
    const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m && m[0] ? m[0].slice(0, 140) : null;
  };

  const pickHours = (localbusiness) => {
    const oh = (localbusiness && (localbusiness.openingHoursSpecification || localbusiness.openingHours)) || null;
    if (!oh) return null;
    try {
      if (typeof oh === 'string') return oh.slice(0, 140);
      if (Array.isArray(oh)) {
        const first = oh[0];
        if (typeof first === 'string') return oh.slice(0, 2).join(' • ').slice(0, 140);
        if (first && typeof first === 'object') {
          const opens = first.opens || null;
          const closes = first.closes || null;
          return (opens && closes) ? `Open ${opens}–${closes}` : null;
        }
      }
      if (typeof oh === 'object') {
        const opens = oh.opens || null;
        const closes = oh.closes || null;
        return (opens && closes) ? `Open ${opens}–${closes}` : null;
      }
    } catch (e) {}
    return null;
  };

  const pickAddress = (napData, localbusiness) => {
    let address = napData && napData.address ? String(napData.address) : null;
    if (!address && localbusiness && localbusiness.address) {
      const a = localbusiness.address;
      if (typeof a === 'string') address = a;
      else if (a.full) address = String(a.full);
      else if (a.streetAddress) {
        const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean);
        address = parts.join(', ');
      }
    }
    return address ? address.slice(0, 240) : null;
  };

  const pickCity = (jobCity, napData, localbusiness) => {
    return (
      (jobCity && String(jobCity).trim()) ||
      (napData && napData.city ? String(napData.city).trim() : null) ||
      (localbusiness && localbusiness.address && localbusiness.address.addressLocality ? String(localbusiness.address.addressLocality).trim() : null) ||
      null
    );
  };

  let phone = null;
  let text_phone = null;
  let email = null;
  let address = null;
  let hours = null;
  let city = null;

  let phone_source = null;
  let email_source = null;
  let address_source = null;
  let hours_source = null;

  // 1) Scraped data across pages (contact > home > others)
  for (const p of orderedPages) {
    const napData = (p && p.nap_json) ? p.nap_json : {};
    const jsonldExtracted = (p && p.jsonld_extracted_json) ? p.jsonld_extracted_json : {};
    const localbusiness = (jsonldExtracted && jsonldExtracted.localbusiness) ? jsonldExtracted.localbusiness : {};
    const orgCpPhone = jsonldExtracted?.organization?.contactPoint?.telephone || null;

    // Phone candidates (priority: nap_json.phone > JSON-LD > CTA tel:)
    if (!phone && napData.phone) {
      phone = String(napData.phone).slice(0, 40);
      phone_source = `nap_json:${p.page_type || 'page'}`;
    }
    if (!phone && localbusiness.telephone) {
      phone = String(localbusiness.telephone).slice(0, 40);
      phone_source = `jsonld_localbusiness:${p.page_type || 'page'}`;
    }
    if (!phone && orgCpPhone) {
      phone = String(orgCpPhone).slice(0, 40);
      phone_source = `jsonld_contactPoint:${p.page_type || 'page'}`;
    }
    if (!phone && Array.isArray(p.cta_candidates_json)) {
      const telCta = p.cta_candidates_json.find(c => c && typeof c.href === 'string' && /^tel:/i.test(c.href));
      if (telCta) {
        const v = cleanPhoneFromHref(telCta.href);
        if (v) {
          phone = v;
          phone_source = `cta_tel:${p.page_type || 'page'}`;
        }
      }
    }

    // Text phone candidates (sms:) if present
    if (!text_phone && napData.text_phone) {
      text_phone = String(napData.text_phone).slice(0, 40);
    }
    if (!text_phone && Array.isArray(p.cta_candidates_json)) {
      const smsCta = p.cta_candidates_json.find(c => c && typeof c.href === 'string' && /^(sms:|smsto:)/i.test(c.href));
      if (smsCta) {
        const v = cleanPhoneFromHref(smsCta.href);
        if (v) text_phone = v;
      }
    }

    // Email candidates (priority: nap_json.email > CTA mailto > text snippet)
    if (!email && napData.email) {
      email = String(napData.email).slice(0, 140);
      email_source = `nap_json:${p.page_type || 'page'}`;
    }
    if (!email && Array.isArray(p.cta_candidates_json)) {
      const mailCta = p.cta_candidates_json.find(c => c && typeof c.href === 'string' && /^mailto:/i.test(c.href));
      if (mailCta) {
        const v = cleanEmailFromHref(mailCta.href);
        if (v) {
          email = v;
          email_source = `cta_mailto:${p.page_type || 'page'}`;
        }
      }
    }
    if (!email && p.text_snippet) {
      const v = extractEmailFromText(p.text_snippet);
      if (v) {
        email = v;
        email_source = `text_snippet:${p.page_type || 'page'}`;
      }
    }

    // Address + hours (best effort)
    if (!address) {
      const v = pickAddress(napData, localbusiness);
      if (v) {
        address = v;
        address_source = `scrape:${p.page_type || 'page'}`;
      }
    }
    if (!hours) {
      const v = pickHours(localbusiness);
      if (v) {
        hours = v;
        hours_source = `jsonld:${p.page_type || 'page'}`;
      }
    }

    if (!city) {
      const v = pickCity(job && job.city, napData, localbusiness);
      if (v) city = v.slice(0, 100);
    }

    // Early exit if we already have the essentials
    if (phone && email && address && hours) break;
  }

  // 2) LLM context fallbacks (still derived from scrape, but not guaranteed)
  if (!phone && companyProfile && Array.isArray(companyProfile.phones) && companyProfile.phones[0]) {
    phone = String(companyProfile.phones[0]).slice(0, 40);
    phone_source = 'llm_context';
  }
  if (!email && companyProfile && Array.isArray(companyProfile.emails) && companyProfile.emails[0]) {
    email = String(companyProfile.emails[0]).slice(0, 140);
    email_source = 'llm_context';
  }

  // 3) Hard fallback mock data (never show an incomplete template)
  if (!phone) {
    phone = placeholders.phone;
    phone_source = 'placeholder';
  }
  if (!text_phone) text_phone = phone;
  if (!email) {
    email = placeholders.email;
    email_source = 'placeholder';
  }
  if (!address) {
    address = placeholders.address;
    address_source = 'placeholder';
  }
  if (!hours) {
    hours = placeholders.hours;
    hours_source = 'placeholder';
  }
  if (!city) city = (job && job.city) ? String(job.city).slice(0, 100) : null;

  return {
    phone,
    text_phone,
    email,
    address,
    hours,
    city,
    phone_source,
    email_source,
    address_source,
    hours_source
  };
}

/**
 * Extract trust signals (years in business, certifications, etc.)
 */
function extractTrustSignals(homepage, llmContext) {
  const trustExtracted = homepage.trust_extracted_json || {};
  const trustSignals = homepage.trust_signals_json || [];
  
  // Years in business
  const yearsSnippet = trustExtracted.years_in_business_snippet;
  let yearsInBusiness = null;
  if (yearsSnippet) {
    const match = yearsSnippet.match(/(\d+)\+?\s*(years?|yrs?)/i);
    if (match) {
      yearsInBusiness = match[1];
    }
  }
  
  // Certifications/licenses
  const certifications = trustSignals
    .filter(s => ['licensed', 'insured', 'certified'].includes(s.type))
    .map(s => s.text)
    .slice(0, 3);

  // License snippet (best-effort)
  let license = null;
  const licenseSignal = trustSignals.find(s => s && s.type === 'licensed' && s.text) || null;
  if (licenseSignal) license = String(licenseSignal.text);
  if (!license && trustExtracted && trustExtracted.licenses_snippet) {
    license = String(trustExtracted.licenses_snippet);
  }
  
  return {
    years_in_business: yearsInBusiness,
    certifications,
    license,
    review_snippets: trustExtracted.review_snippets || []
  };
}

/**
 * Extract footer navigation
 */
function extractFooter(homepage) {
  const footerLinks = homepage.footer_nav_links_json || [];
  
  if (footerLinks.length === 0) {
    return {
      links: [
        { text: 'Privacy Policy', url: '#privacy' },
        { text: 'Terms of Service', url: '#terms' }
      ]
    };
  }
  
  // Limit footer links to 10
  return {
    links: footerLinks.slice(0, 10).map(link => ({
      text: link.text || 'Link',
      url: link.url || link.href || '#'
    }))
  };
}

/**
 * Extract service area cities
 */
function extractServiceArea(pagesOrHomepage, job) {
  const pages = Array.isArray(pagesOrHomepage) ? pagesOrHomepage : [pagesOrHomepage].filter(Boolean);

  const areaServedAll = [];
  const citiesAll = [];

  pages.forEach((p) => {
    if (!p) return;
    const jsonld = p.jsonld_extracted_json || {};
    const localbusiness = jsonld.localbusiness || {};
    const areaServed = localbusiness.areaServed || [];
    (Array.isArray(areaServed) ? areaServed : [areaServed]).forEach((a) => {
      if (a) areaServedAll.push(String(a));
    });
    const cities = Array.isArray(p.cities_json) ? p.cities_json : [];
    cities.forEach((c) => {
      if (c) citiesAll.push(String(c));
    });
    const napCity = p.nap_json && p.nap_json.city ? String(p.nap_json.city) : null;
    if (napCity) citiesAll.push(napCity);
  });

  const areaServedStrings = [...new Set(areaServedAll.map(s => s.trim()).filter(Boolean))];
  const cityStrings = [...new Set(citiesAll.map(s => s.trim()).filter(Boolean))];

  // Combine areaServed (often counties/regions) with city mentions
  const allCities = [...new Set([...areaServedStrings, ...cityStrings])].filter(Boolean);

  // Always include job city if not in list
  if (job && job.city && !allCities.includes(job.city)) {
    allCities.unshift(job.city);
  }

  // Headline area prefers a County/Region label if present
  const primaryArea =
    areaServedStrings.find(s => /county/i.test(s)) ||
    areaServedStrings.find(s => /region|area/i.test(s)) ||
    (job && job.city ? job.city : null);
  const secondaryArea =
    areaServedStrings.filter(s => s !== primaryArea).slice(0, 1)[0] || null;

  return {
    cities: (allCities.length ? allCities : [(job && job.city) ? job.city : 'your area']).slice(0, 24),
    primary_area: primaryArea || ((job && job.city) ? job.city : null),
    secondary_area: secondaryArea
  };
}

/**
 * Build review variables for replacement
 */
function buildReviewVariables(job, companyProfile, services) {
  const companyName = companyProfile.name || job.company_name || 'this company';
  const city = job.city || 'our area';
  const niche = job.niche || 'service provider';
  
  // Get first service title
  let serviceType = niche;
  if (services && services.length > 0 && services[0].title) {
    serviceType = services[0].title.toLowerCase();
  }
  
  return {
    company_name: companyName,
    city: city,
    niche: niche,
    service_type: serviceType
  };
}

/**
 * Replace variables in review text
 * Supports: {{company_name}}, {{city}}, {{service_type}}, {{niche}}
 */
function replaceReviewVariables(reviewText, variables) {
  let result = reviewText;
  
  // Replace all variables
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  
  return result;
}

/**
 * Render template with data
 */
async function renderTemplate(presetSlug, data) {
  console.log(`[HOMEPAGE BUILDER] Rendering template: ${presetSlug}`);
  
  const templatePath = path.join(__dirname, '../views/preset-templates', `${presetSlug}.ejs`);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  
  try {
    const html = await ejs.renderFile(templatePath, data);
    console.log(`[HOMEPAGE BUILDER] Template rendered successfully (${html.length} bytes)`);
    return html;
  } catch (err) {
    console.error('[HOMEPAGE BUILDER] Template rendering error:', err);
    throw new Error(`Failed to render template: ${err.message}`);
  }
}

module.exports = {
  buildTemplateData,
  selectBestLogo,
  extractMenuStructure,
  extractServices,
  replaceReviewVariables,
  renderTemplate,
  downloadAndStoreAsset
};
