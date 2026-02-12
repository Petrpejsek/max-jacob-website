const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
// (no direct http/https usage; downloads use fetch)
const {
  getAuditJobById,
  updateAuditJob,
  appendAuditRunLog,
  getActivePromptTemplates,
  createPromptTemplateVersion,
  getNichePresetById,
  insertCrawledPage,
  insertLighthouseReport,
  getAllAssistants,
  getCrawledPagesByJobId
} = require('../db');
const { getDefaultPromptTemplates } = require('./promptTemplates');
const { getPersistentPublicDir } = require('../runtimePaths');
const { pickCompanyNameFromSignals } = require('../helpers/companyName');
const { normalizeWebsiteUrl } = require('../helpers/urlUtils');

// Scraper v3 (multi-page crawler)
let scraperV3 = null;
try {
  scraperV3 = require('./scraperV3');
} catch (err) {
  console.log('[AUDIT PIPELINE] Scraper v3 not available:', err.message);
}

// Check if Scraper v3 is enabled via environment variable (default: true)
const USE_SCRAPER_V3 = process.env.USE_SCRAPER_V3 !== 'false' && process.env.USE_SCRAPER_V3 !== '0';

// Homepage Builder (dynamic homepage proposals)
const homepageBuilder = require('./homepageBuilder');

// Template Audit Engine (replaces LLM assistants for fast, deterministic audits)
const templateEngine = require('./templateAuditEngine');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'our',
  'are', 'was', 'were', 'can', 'will', 'have', 'has', 'had', 'but', 'not',
  'all', 'any', 'get', 'call', 'now', 'free', 'best', 'top', 'about', 'home',
  'service', 'services', 'contact', 'learn', 'more', 'request', 'quote'
]);

const TRUST_KEYWORDS = [
  'licensed', 'insured', 'reviews', 'certified', 'award', 'years', 'since',
  'family owned', 'warranty', 'guarantee', 'bbb'
];

function logStep(jobId, step, message) {
  return new Promise((resolve, reject) => {
    appendAuditRunLog(jobId, step, 'info', message, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function updateJob(jobId, updates) {
  return new Promise((resolve, reject) => {
    updateAuditJob(jobId, updates, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function loadJob(jobId) {
  return new Promise((resolve, reject) => {
    getAuditJobById(jobId, (err, job) => {
      if (err) return reject(err);
      resolve(job);
    });
  });
}

function loadActivePrompts() {
  return new Promise((resolve, reject) => {
    getActivePromptTemplates((err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureDefaultPrompts() {
  const active = await loadActivePrompts();
  const defaults = getDefaultPromptTemplates();
  const activeByName = {};

  active.forEach((item) => {
    activeByName[item.name] = item;
  });

  const names = Object.keys(defaults);
  const missing = names.filter((name) => !activeByName[name]);

  if (missing.length === 0) {
    return activeByName;
  }

  await Promise.all(
    missing.map((name) => {
      return new Promise((resolve, reject) => {
        createPromptTemplateVersion(name, defaults[name].trim(), (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    })
  );

  const refreshed = await loadActivePrompts();
  const refreshedByName = {};
  refreshed.forEach((item) => {
    refreshedByName[item.name] = item;
  });

  return refreshedByName;
}

function sanitizeText(text) {
  return (text || '').toString().trim();
}

function extractCityFromUsAddressString(address) {
  const s = (address || '').toString().trim();
  if (!s) return null;
  // Common US pattern: "... , City Name , ST ..." (zip optional, commas vary)
  // Examples:
  // - "1150 SW 27th Ave, Fort Lauderdale, FL, 33312"
  // - "1150 SW 27th Ave, Fort Lauderdale, FL 33312"
  const m = s.match(/,\s*([A-Za-z][A-Za-z\s.'-]{1,80}?)\s*,\s*([A-Z]{2})\b/);
  if (!m || !m[1]) return null;
  return m[1].trim().slice(0, 100);
}

function assertCompliantJson(output) {
  const text = JSON.stringify(output || {});
  const bannedPatterns = [
    /%/i,
    /percent/i,
    /guarantee/i,
    /guaranteed/i,
    /your website is bad/i
  ];

  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) {
      throw new Error('Compliance violation in LLM output');
    }
  }
}

function validateEvidenceInIssues(uxJson) {
  // Validate that each issue has proper evidence
  const issues = uxJson.top_3_leaks || [];
  const invalidIssues = [];

  issues.forEach((issue, index) => {
    const hasEvidence = issue.evidence && typeof issue.evidence === 'string' && issue.evidence.length > 10;
    const isInsufficientSignal = issue.insufficient_signal === true;

    // If insufficient_signal is set, that's OK (they acknowledged missing data)
    if (isInsufficientSignal) {
      return;
    }

    // Otherwise, evidence must be present and substantial
    if (!hasEvidence) {
      invalidIssues.push({
        index,
        problem: issue.problem || 'Unknown issue',
        reason: 'Missing or insufficient evidence field'
      });
    }
  });

  if (invalidIssues.length > 0) {
    const errorMessage = `LLM output validation failed: ${invalidIssues.length} issue(s) missing evidence:\n` +
      invalidIssues.map((inv) => `  - Issue ${inv.index + 1}: "${inv.problem}" (${inv.reason})`).join('\n');
    throw new Error(errorMessage);
  }

  return true;
}

async function callOpenRouter({ model, temperature, messages }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      messages
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  return payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : '';
}

function parseJsonFromText(text) {
  const trimmed = sanitizeText(text);
  if (!trimmed) {
    throw new Error('Empty LLM response');
  }

  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw e;
  }
}

// Contact extraction utilities for Scraper v2

function normalizePhoneToUS(phone) {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If it starts with 1 and has 11 digits, remove the 1
  if (digits.length === 11 && digits[0] === '1') {
    return digits.slice(1);
  }
  
  // Return 10 digits if valid US format
  if (digits.length === 10) {
    return digits;
  }
  
  // Return as-is if not standard format
  return digits;
}

function parseJsonLdContacts(structuredDataArray) {
  // Parse JSON-LD for LocalBusiness/Organization contact info
  const result = {
    phones: [],
    emails: [],
    address: null,
    hours: null,
    organization_name: null,
    localbusiness_name: null,
    website_name: null,
    logo_url: null,
    logo_source: null,
    social_links: {
      facebook: [],
      instagram: [],
      twitter: [],
      linkedin: [],
      yelp: []
    }
  };
  
  if (!structuredDataArray || structuredDataArray.length === 0) {
    return result;
  }
  
  structuredDataArray.forEach((data) => {
    // Handle arrays of items (common in JSON-LD)
    const items = Array.isArray(data) ? data : [data];
    
    items.forEach((item) => {
      // Normalize types for matching
      const rawType = item['@type'];
      const typeList = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : []);
      const typeStr = typeList.join(' ');
      const isOrg = typeList.includes('Organization') || /Organization/i.test(typeStr);
      const isWebsite = typeList.includes('WebSite') || /WebSite/i.test(typeStr);
      const isLocalish = typeList.includes('LocalBusiness') || /LocalBusiness|Plumber|PlumbingService|HomeAndConstructionBusiness|ProfessionalService/i.test(typeStr);

      // Names (for company_name selection)
      if (item.name) {
        if (isOrg && !result.organization_name) result.organization_name = String(item.name).slice(0, 200);
        if (isLocalish && !result.localbusiness_name) result.localbusiness_name = String(item.name).slice(0, 200);
        if (isWebsite && !result.website_name) result.website_name = String(item.name).slice(0, 200);
      }

      // Logo candidates (for v1 pack / fallback)
      if (!result.logo_url) {
        if (isOrg && item.logo) {
          const u = typeof item.logo === 'string' ? item.logo : (item.logo.url || item.logo['@url']);
          if (u) { result.logo_url = u; result.logo_source = 'jsonld_organization'; }
        } else if (isLocalish && item.image) {
          const u = typeof item.image === 'string' ? item.image : (item.image.url || item.image['@url']);
          if (u) { result.logo_url = u; result.logo_source = 'jsonld_localbusiness'; }
        }
      }

      // Only LocalBusiness/Organization/WebSite are relevant for contacts
      if (!isOrg && !isLocalish && !isWebsite) {
        return;
      }
      
      // Extract telephone
      if (item.telephone) {
        const normalized = normalizePhoneToUS(item.telephone);
        if (normalized.length >= 10) {
          const formatted = normalized.length === 10 
            ? `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
            : normalized;
          result.phones.push({ value: formatted, source: 'jsonld', raw: item.telephone });
        }
      }
      
      // Extract email
      if (item.email) {
        const email = item.email.replace('mailto:', '').trim().toLowerCase();
        if (email && email.includes('@')) {
          result.emails.push({ value: email, source: 'jsonld' });
        }
      }
      
      // Extract address
      if (item.address && !result.address) {
        let addressText = '';
        if (typeof item.address === 'string') {
          addressText = item.address;
        } else if (item.address['@type'] === 'PostalAddress') {
          const parts = [
            item.address.streetAddress,
            item.address.addressLocality,
            item.address.addressRegion,
            item.address.postalCode
          ].filter(Boolean);
          addressText = parts.join(', ');
        }
        if (addressText.length > 10) {
          result.address = { value: addressText, source: 'jsonld' };
        }
      }
      
      // Extract opening hours
      if (!result.hours) {
        if (item.openingHours) {
          const hoursText = Array.isArray(item.openingHours)
            ? item.openingHours.join('\n')
            : item.openingHours;
          result.hours = { value: String(hoursText).slice(0, 500), source: 'jsonld_openingHours' };
        } else if (item.openingHoursSpecification && Array.isArray(item.openingHoursSpecification)) {
          // MVP: detect 24/7 (00:00 to 23:59 / 24:00 for all days)
          const spec = item.openingHoursSpecification;
          const days = new Set();
          let opens = null;
          let closes = null;
          spec.forEach(row => {
            const d = row.dayOfWeek;
            const addDay = (x) => {
              const s = String(x || '').toLowerCase().replace(/^https?:\/\/schema\.org\//i, '');
              if (s.includes('monday')) days.add('mon');
              else if (s.includes('tuesday')) days.add('tue');
              else if (s.includes('wednesday')) days.add('wed');
              else if (s.includes('thursday')) days.add('thu');
              else if (s.includes('friday')) days.add('fri');
              else if (s.includes('saturday')) days.add('sat');
              else if (s.includes('sunday')) days.add('sun');
            };
            if (Array.isArray(d)) d.forEach(addDay); else if (d) addDay(d);
            if (!opens && row.opens) opens = String(row.opens);
            if (!closes && row.closes) closes = String(row.closes);
          });
          const norm = (t) => String(t || '').trim().replace(/:00$/,'').replace(/:00:00$/,'');
          const o = norm(opens);
          const c = norm(closes);
          const is247 = days.size >= 7 && (o === '00:00' || o === '0:00') && (c === '23:59' || c === '24:00');
          result.hours = is247
            ? { value: '24/7', source: 'jsonld_openingHoursSpecification' }
            : { value: `${o || ''}${o && c ? '–' : ''}${c || ''}`.trim() || null, source: 'jsonld_openingHoursSpecification' };
        }
      }
      
      // Extract social links (sameAs property)
      if (item.sameAs) {
        const sameAsLinks = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
        sameAsLinks.forEach((link) => {
          const lower = link.toLowerCase();
          if (lower.includes('facebook.com')) {
            result.social_links.facebook.push({ value: link, source: 'jsonld' });
          } else if (lower.includes('instagram.com')) {
            result.social_links.instagram.push({ value: link, source: 'jsonld' });
          } else if (lower.includes('twitter.com') || lower.includes('x.com')) {
            result.social_links.twitter.push({ value: link, source: 'jsonld' });
          } else if (lower.includes('linkedin.com')) {
            result.social_links.linkedin.push({ value: link, source: 'jsonld' });
          } else if (lower.includes('yelp.com')) {
            result.social_links.yelp.push({ value: link, source: 'jsonld' });
          }
        });
      }
    });
  });
  
  return result;
}

function mergeContactSources(homepageContacts, jsonLdContacts, contactPageData) {
  // Priority: JSON-LD > tel/mailto links > homepage text > contact page
  // Dedup and track sources
  
  const phonesMap = new Map(); // normalized -> {value, source, raw}
  const emailsMap = new Map(); // email -> {value, source}
  const socialMap = {
    facebook: new Map(),
    instagram: new Map(),
    twitter: new Map(),
    linkedin: new Map(),
    yelp: new Map(),
    google_maps: new Map(),
    google_business: new Map()
  };
  
  let finalAddress = null;
  let finalHours = null;
  
  // Priority 1: JSON-LD
  if (jsonLdContacts) {
    (jsonLdContacts.phones || []).forEach((item) => {
      const normalized = normalizePhoneToUS(item.raw || item.value);
      if (!phonesMap.has(normalized)) {
        phonesMap.set(normalized, item);
      }
    });
    
    (jsonLdContacts.emails || []).forEach((item) => {
      if (!emailsMap.has(item.value)) {
        emailsMap.set(item.value, item);
      }
    });
    
    if (jsonLdContacts.address) {
      finalAddress = jsonLdContacts.address;
    }
    
    if (jsonLdContacts.hours) {
      finalHours = jsonLdContacts.hours;
    }
    
    Object.keys(jsonLdContacts.social_links || {}).forEach((platform) => {
      (jsonLdContacts.social_links[platform] || []).forEach((item) => {
        if (socialMap[platform]) {
          socialMap[platform].set(item.value, item);
        }
      });
    });
  }
  
  // Priority 2: Homepage DOM extraction
  if (homepageContacts) {
    (homepageContacts.phones || []).forEach((item) => {
      const normalized = normalizePhoneToUS(item.raw || item.value);
      if (!phonesMap.has(normalized)) {
        phonesMap.set(normalized, item);
      }
    });
    
    (homepageContacts.emails || []).forEach((item) => {
      if (!emailsMap.has(item.value)) {
        emailsMap.set(item.value, item);
      }
    });
    
    if (!finalAddress && homepageContacts.address) {
      finalAddress = homepageContacts.address;
    }
    
    if (!finalHours && homepageContacts.hours) {
      finalHours = homepageContacts.hours;
    }
    
    Object.keys(homepageContacts.social_links || {}).forEach((platform) => {
      (homepageContacts.social_links[platform] || []).forEach((item) => {
        if (socialMap[platform] && !socialMap[platform].has(item.value)) {
          socialMap[platform].set(item.value, item);
        }
      });
    });
  }
  
  // Priority 3: Contact page data
  if (contactPageData) {
    (contactPageData.phones || []).forEach((item) => {
      const normalized = normalizePhoneToUS(item.raw || item.value);
      if (!phonesMap.has(normalized)) {
        phonesMap.set(normalized, item);
      }
    });
    
    (contactPageData.emails || []).forEach((item) => {
      if (!emailsMap.has(item.value)) {
        emailsMap.set(item.value, item);
      }
    });
  }
  
  // Convert maps to arrays and limit
  const finalContacts = {
    phones: Array.from(phonesMap.values()).slice(0, 5),
    emails: Array.from(emailsMap.values()).slice(0, 5),
    address: finalAddress,
    hours: finalHours,
    social_links: {}
  };
  
  Object.keys(socialMap).forEach((platform) => {
    finalContacts.social_links[platform] = Array.from(socialMap[platform].values()).slice(0, 2);
  });
  
  return finalContacts;
}

function extractPhones(page) {
  // Extract from tel: links and text
  const phones = new Set();
  
  // Get tel: links
  const telLinks = page.querySelectorAll('a[href^="tel:"]');
  telLinks.forEach((link) => {
    const href = link.getAttribute('href');
    const phone = href.replace('tel:', '').trim();
    const normalized = normalizePhoneToUS(phone);
    if (normalized.length >= 10) {
      phones.add(normalized);
    }
  });
  
  // Extract from text using regex (US format)
  const bodyText = page.body ? page.body.innerText : '';
  const phoneRegex = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
  const matches = bodyText.matchAll(phoneRegex);
  
  for (const match of matches) {
    const normalized = normalizePhoneToUS(match[0]);
    if (normalized.length >= 10) {
      phones.add(normalized);
    }
  }
  
  return Array.from(phones).slice(0, 5); // Limit to top 5
}

function extractEmails(page) {
  const emails = new Set();
  
  // Get mailto: links
  const mailtoLinks = page.querySelectorAll('a[href^="mailto:"]');
  mailtoLinks.forEach((link) => {
    const href = link.getAttribute('href');
    const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
    if (email && email.includes('@')) {
      emails.add(email);
    }
  });
  
  // Extract from text using regex
  const bodyText = page.body ? page.body.innerText : '';
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const matches = bodyText.matchAll(emailRegex);
  
  for (const match of matches) {
    const email = match[0].toLowerCase();
    // Filter out common placeholder/generic emails
    if (!email.includes('example.com') && !email.includes('yourdomain')) {
      emails.add(email);
    }
  }
  
  return Array.from(emails).slice(0, 5); // Limit to top 5
}

function extractSocialLinks(page) {
  const socialLinks = {
    facebook: [],
    instagram: [],
    yelp: [],
    google_maps: [],
    google_business: []
  };
  
  const allLinks = page.querySelectorAll('a[href]');
  
  allLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const lowerHref = href.toLowerCase();
    
    // Facebook
    if ((lowerHref.includes('facebook.com') || lowerHref.includes('fb.com')) && 
        !lowerHref.includes('facebook.com/sharer')) {
      socialLinks.facebook.push(href);
    }
    
    // Instagram
    if (lowerHref.includes('instagram.com')) {
      socialLinks.instagram.push(href);
    }
    
    // Yelp
    if (lowerHref.includes('yelp.com')) {
      socialLinks.yelp.push(href);
    }
    
    // Google Maps
    if (lowerHref.includes('maps.google.com') || lowerHref.includes('goo.gl/maps')) {
      socialLinks.google_maps.push(href);
    }
    
    // Google Business Profile
    if (lowerHref.includes('business.google.com') || lowerHref.includes('g.page/')) {
      socialLinks.google_business.push(href);
    }
  });
  
  // Deduplicate and limit
  return {
    facebook: [...new Set(socialLinks.facebook)].slice(0, 2),
    instagram: [...new Set(socialLinks.instagram)].slice(0, 2),
    yelp: [...new Set(socialLinks.yelp)].slice(0, 2),
    google_maps: [...new Set(socialLinks.google_maps)].slice(0, 2),
    google_business: [...new Set(socialLinks.google_business)].slice(0, 2)
  };
}

function extractAddress(page) {
  // Simple heuristic: look for elements with address-like keywords
  const addressKeywords = ['address', 'location', 'find us', 'visit us'];
  const bodyText = page.body ? page.body.innerText : '';
  
  // Look for address schema.org markup
  const addressElements = page.querySelectorAll('[itemprop="address"], .address, #address');
  if (addressElements.length > 0) {
    const addressText = addressElements[0].innerText.trim();
    if (addressText.length > 10 && addressText.length < 200) {
      return addressText;
    }
  }
  
  // Look for US address pattern (simplified)
  const addressRegex = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir)[.,\s]+[\w\s]+,?\s+[A-Z]{2}\s+\d{5}/i;
  const match = bodyText.match(addressRegex);
  
  if (match) {
    return match[0].trim();
  }
  
  return null;
}

function extractHours(page) {
  // Simple heuristic: look for hours-related elements
  const hoursElements = page.querySelectorAll('[itemprop="openingHours"], .hours, #hours, .business-hours, #business-hours');
  
  if (hoursElements.length > 0) {
    const hoursText = hoursElements[0].innerText.trim();
    if (hoursText.length > 10 && hoursText.length < 500) {
      return hoursText;
    }
  }
  
  // Look for days of week pattern
  const bodyText = page.body ? page.body.innerText : '';
  const daysPattern = /(Monday|Mon|Tuesday|Tue|Wednesday|Wed|Thursday|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun)[\s:\-]+\d{1,2}:\d{2}/i;
  
  if (daysPattern.test(bodyText)) {
    // Extract a snippet around the match
    const match = bodyText.match(daysPattern);
    if (match) {
      const index = match.index;
      const snippet = bodyText.slice(Math.max(0, index - 50), Math.min(bodyText.length, index + 300));
      return snippet.trim();
    }
  }
  
  return null;
}

async function scrapeWebsite(url, jobId) {
  const launchArgs = [];
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for page to stabilize (prevents "execution context destroyed" if page navigates)
  await page.waitForTimeout(1500);

  let extracted;
  try {
    extracted = await page.evaluate(() => {
    // Utility functions for contact extraction (browser context) - v2 with source tracking
    function normalizePhoneToUS(phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 11 && digits[0] === '1') {
        return digits.slice(1);
      }
      if (digits.length === 10) {
        return digits;
      }
      return digits;
    }

    function formatPhoneDisplay(digits) {
      // Format as (XXX) XXX-XXXX
      if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      return digits;
    }

    function extractPhones() {
      const phonesMap = new Map(); // normalized -> {value, source}
      const debugInfo = {
        sources_checked: ['homepage_dom', 'tel_links', 'header_text', 'footer_text', 'body_regex'],
        candidates_found: 0
      };
      
      // 1. Extract from tel: links (highest priority)
      const telLinks = document.querySelectorAll('a[href^="tel:"]');
      telLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const phone = href.replace('tel:', '').trim();
        const normalized = normalizePhoneToUS(phone);
        if (normalized.length >= 10) {
          debugInfo.candidates_found++;
          if (!phonesMap.has(normalized)) {
            phonesMap.set(normalized, {
              value: formatPhoneDisplay(normalized),
              source: 'tel_link',
              raw: phone
            });
          }
        }
      });
      
      // 2. Extract from header/footer (higher priority than general body)
      const headerEl = document.querySelector('header, .header, nav, .nav, .top-bar');
      const footerEl = document.querySelector('footer, .footer');
      const phoneRegex = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
      
      if (headerEl) {
        const headerText = headerEl.innerText || '';
        const matches = [...headerText.matchAll(phoneRegex)];
        matches.forEach((match) => {
          const normalized = normalizePhoneToUS(match[0]);
          if (normalized.length >= 10) {
            debugInfo.candidates_found++;
            if (!phonesMap.has(normalized)) {
              phonesMap.set(normalized, {
                value: formatPhoneDisplay(normalized),
                source: 'header_text',
                raw: match[0]
              });
            }
          }
        });
      }
      
      if (footerEl) {
        const footerText = footerEl.innerText || '';
        const matches = [...footerText.matchAll(phoneRegex)];
        matches.forEach((match) => {
          const normalized = normalizePhoneToUS(match[0]);
          if (normalized.length >= 10) {
            debugInfo.candidates_found++;
            if (!phonesMap.has(normalized)) {
              phonesMap.set(normalized, {
                value: formatPhoneDisplay(normalized),
                source: 'footer_text',
                raw: match[0]
              });
            }
          }
        });
      }
      
      // 3. Extract from general body text (lowest priority)
      const bodyText = document.body ? document.body.innerText : '';
      const bodyMatches = [...bodyText.matchAll(phoneRegex)];
      bodyMatches.forEach((match) => {
        const normalized = normalizePhoneToUS(match[0]);
        if (normalized.length >= 10) {
          debugInfo.candidates_found++;
          if (!phonesMap.has(normalized)) {
            phonesMap.set(normalized, {
              value: formatPhoneDisplay(normalized),
              source: 'body_regex',
              raw: match[0]
            });
          }
        }
      });
      
      return {
        phones: Array.from(phonesMap.values()).slice(0, 5),
        debug: debugInfo
      };
    }

    function extractEmails() {
      const emailsMap = new Map(); // email -> {value, source}
      const debugInfo = {
        sources_checked: ['homepage_dom', 'mailto_links', 'header_text', 'footer_text', 'body_regex'],
        candidates_found: 0
      };
      
      // 1. Extract from mailto: links (highest priority)
      const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
      mailtoLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email && email.includes('@') && !email.includes('example.com') && !email.includes('yourdomain')) {
          debugInfo.candidates_found++;
          if (!emailsMap.has(email)) {
            emailsMap.set(email, {
              value: email,
              source: 'mailto_link'
            });
          }
        }
      });
      
      // 2. Extract from header/footer text
      const headerEl = document.querySelector('header, .header, nav, .nav, .top-bar');
      const footerEl = document.querySelector('footer, .footer');
      const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
      
      if (headerEl) {
        const headerText = headerEl.innerText || '';
        const matches = [...headerText.matchAll(emailRegex)];
        matches.forEach((match) => {
          const email = match[0].toLowerCase();
          if (!email.includes('example.com') && !email.includes('yourdomain')) {
            debugInfo.candidates_found++;
            if (!emailsMap.has(email)) {
              emailsMap.set(email, {
                value: email,
                source: 'header_text'
              });
            }
          }
        });
      }
      
      if (footerEl) {
        const footerText = footerEl.innerText || '';
        const matches = [...footerText.matchAll(emailRegex)];
        matches.forEach((match) => {
          const email = match[0].toLowerCase();
          if (!email.includes('example.com') && !email.includes('yourdomain')) {
            debugInfo.candidates_found++;
            if (!emailsMap.has(email)) {
              emailsMap.set(email, {
                value: email,
                source: 'footer_text'
              });
            }
          }
        });
      }
      
      // 3. Extract from general body text (lowest priority)
      const bodyText = document.body ? document.body.innerText : '';
      const bodyMatches = [...bodyText.matchAll(emailRegex)];
      bodyMatches.forEach((match) => {
        const email = match[0].toLowerCase();
        if (!email.includes('example.com') && !email.includes('yourdomain')) {
          debugInfo.candidates_found++;
          if (!emailsMap.has(email)) {
            emailsMap.set(email, {
              value: email,
              source: 'body_regex'
            });
          }
        }
      });
      
      return {
        emails: Array.from(emailsMap.values()).slice(0, 5),
        debug: debugInfo
      };
    }

    function extractSocialLinks() {
      const socialLinksMap = {
        facebook: new Map(),
        instagram: new Map(),
        twitter: new Map(),
        linkedin: new Map(),
        yelp: new Map(),
        google_maps: new Map(),
        google_business: new Map()
      };
      const debugInfo = {
        sources_checked: ['homepage_dom', 'all_links'],
        candidates_found: 0
      };
      
      const allLinks = document.querySelectorAll('a[href]');
      
      allLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const lowerHref = href.toLowerCase();
        
        // Skip share/sharer links and generic pages
        if (lowerHref.includes('/sharer') || lowerHref.includes('/share') || lowerHref.includes('intent/tweet')) {
          return;
        }
        
        // Facebook (prefer profile/page URLs)
        if ((lowerHref.includes('facebook.com') || lowerHref.includes('fb.com'))) {
          debugInfo.candidates_found++;
          // Prefer URLs with actual usernames/pages
          const isProfile = lowerHref.includes('facebook.com/') && !lowerHref.includes('facebook.com/?');
          if (isProfile) {
            socialLinksMap.facebook.set(href, { value: href, source: 'profile_link' });
          }
        }
        
        // Instagram
        if (lowerHref.includes('instagram.com') && !lowerHref.includes('instagram.com/?')) {
          debugInfo.candidates_found++;
          socialLinksMap.instagram.set(href, { value: href, source: 'profile_link' });
        }
        
        // Twitter/X
        if (lowerHref.includes('twitter.com') || lowerHref.includes('x.com')) {
          debugInfo.candidates_found++;
          socialLinksMap.twitter.set(href, { value: href, source: 'profile_link' });
        }
        
        // LinkedIn
        if (lowerHref.includes('linkedin.com') && lowerHref.includes('/company/')) {
          debugInfo.candidates_found++;
          socialLinksMap.linkedin.set(href, { value: href, source: 'profile_link' });
        }
        
        // Yelp
        if (lowerHref.includes('yelp.com') && lowerHref.includes('/biz/')) {
          debugInfo.candidates_found++;
          socialLinksMap.yelp.set(href, { value: href, source: 'business_link' });
        }
        
        // Google Maps
        if (lowerHref.includes('maps.google.com') || lowerHref.includes('goo.gl/maps') || lowerHref.includes('maps.app.goo.gl')) {
          debugInfo.candidates_found++;
          socialLinksMap.google_maps.set(href, { value: href, source: 'maps_link' });
        }
        
        // Google Business Profile
        if (lowerHref.includes('business.google.com') || lowerHref.includes('g.page/')) {
          debugInfo.candidates_found++;
          socialLinksMap.google_business.set(href, { value: href, source: 'business_link' });
        }
      });
      
      return {
        social_links: {
          facebook: Array.from(socialLinksMap.facebook.values()).slice(0, 2),
          instagram: Array.from(socialLinksMap.instagram.values()).slice(0, 2),
          twitter: Array.from(socialLinksMap.twitter.values()).slice(0, 2),
          linkedin: Array.from(socialLinksMap.linkedin.values()).slice(0, 2),
          yelp: Array.from(socialLinksMap.yelp.values()).slice(0, 2),
          google_maps: Array.from(socialLinksMap.google_maps.values()).slice(0, 2),
          google_business: Array.from(socialLinksMap.google_business.values()).slice(0, 2)
        },
        debug: debugInfo
      };
    }

    function extractAddressAndHours() {
      const result = {
        address: null,
        hours: null,
        debug: {
          address: { sources_checked: ['jsonld', 'schema_markup', 'css_selectors', 'regex'], candidates_found: 0 },
          hours: { sources_checked: ['jsonld', 'schema_markup', 'css_selectors', 'day_pattern'], candidates_found: 0 }
        }
      };
      
      // Address extraction
      const addressElements = document.querySelectorAll('[itemprop="address"], .address, #address');
      if (addressElements.length > 0) {
        const addressText = addressElements[0].innerText.trim();
        if (addressText.length > 10 && addressText.length < 200) {
          result.address = { value: addressText, source: 'schema_markup' };
          result.debug.address.candidates_found++;
        }
      }
      
      if (!result.address) {
        const bodyText = document.body ? document.body.innerText : '';
        const addressRegex = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir)[.,\s]+[\w\s]+,?\s+[A-Z]{2}\s+\d{5}/i;
        const match = bodyText.match(addressRegex);
        
        if (match) {
          result.address = { value: match[0].trim(), source: 'regex' };
          result.debug.address.candidates_found++;
        }
      }
      
      // Hours extraction
      const hoursElements = document.querySelectorAll('[itemprop="openingHours"], .hours, #hours, .business-hours, #business-hours');
      if (hoursElements.length > 0) {
        const hoursText = hoursElements[0].innerText.trim();
        if (hoursText.length > 10 && hoursText.length < 500) {
          result.hours = { value: hoursText, source: 'schema_markup' };
          result.debug.hours.candidates_found++;
        }
      }
      
      if (!result.hours) {
        const bodyText = document.body ? document.body.innerText : '';
        const daysPattern = /(Monday|Mon|Tuesday|Tue|Wednesday|Wed|Thursday|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun)[\s:\-]+\d{1,2}:\d{2}/i;
        
        if (daysPattern.test(bodyText)) {
          const match = bodyText.match(daysPattern);
          if (match) {
            const index = match.index;
            const snippet = bodyText.slice(Math.max(0, index - 50), Math.min(bodyText.length, index + 300));
            result.hours = { value: snippet.trim(), source: 'day_pattern' };
            result.debug.hours.candidates_found++;
          }
        }
      }
      
      return result;
    }

    // Extract basic page data
    const title = document.title || '';
    const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText : '';
    const h2 = Array.from(document.querySelectorAll('h2')).map((el) => el.innerText).filter(Boolean);
    const metaDescription = document.querySelector('meta[name="description"]')
      ? document.querySelector('meta[name="description"]').getAttribute('content')
      : '';
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')
      ? document.querySelector('meta[property="og:site_name"]').getAttribute('content')
      : '';

    const makeAbs = (u) => {
      try { return new URL(u, window.location.href).href; } catch { return u; }
    };
    const ogImage = document.querySelector('meta[property="og:image"]')
      ? document.querySelector('meta[property="og:image"]').getAttribute('content')
      : '';
    const ogImageAbs = ogImage ? makeAbs(ogImage) : '';
    const headerElForLogo = document.querySelector('header, .header, nav, .nav, .top-bar');
    let headerLogo = '';
    if (headerElForLogo) {
      const img = headerElForLogo.querySelector('img[alt*="logo" i], img[class*="logo" i], img[id*="logo" i], .logo img, #logo img');
      const src = img ? (img.getAttribute('src') || '') : '';
      headerLogo = src ? makeAbs(src) : '';
    }

    const ctaCandidates = Array.from(document.querySelectorAll('a, button'))
      .map((el) => (el.innerText || '').trim())
      .filter(Boolean);

    const contactLink = Array.from(document.querySelectorAll('a'))
      .map((el) => el.getAttribute('href') || '')
      .find((href) => href.toLowerCase().includes('contact')) || '';

    const navText = Array.from(document.querySelectorAll('nav a'))
      .map((el) => (el.innerText || '').trim())
      .filter(Boolean);

    const headingText = []
      .concat(h1 ? [h1] : [])
      .concat(h2 || []);

    const bodyText = document.body ? document.body.innerText : '';
    
    // Extract all headings for raw dump
    const allHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.innerText.trim()
      }))
      .filter((h) => h.text.length > 0)
      .slice(0, 50); // Limit to 50 headings
    
    // Extract structured data (JSON-LD)
    const structuredData = [];
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent);
        structuredData.push(data);
      } catch (e) {
        // Ignore invalid JSON-LD
      }
    });
    
    // Extract contact data (v2 with source tracking)
    const phonesResult = extractPhones();
    const emailsResult = extractEmails();
    const socialResult = extractSocialLinks();
    const addressHoursResult = extractAddressAndHours();

    // Layout summary for evidence-based LLM evaluation
    const layoutSummary = {};

    // Phone detection in header
    const headerEl = document.querySelector('header, .header, nav, .nav, .top-bar');
    const phoneRegex = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
    const headerText = headerEl ? headerEl.innerText : '';
    layoutSummary.has_phone_in_header = phoneRegex.test(headerText);
    
    // Check if phone is clickable (tel: link)
    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
    layoutSummary.phone_clickable_tel_link = telLinks.length > 0;

    // Hero detection (first h1 + nearby text)
    const h1El = document.querySelector('h1');
    if (h1El) {
      const h1Text = h1El.innerText || '';
      layoutSummary.hero_h1_text = h1Text.slice(0, 140).trim();
      
      // Try to find subheadline (p or h2 near h1)
      const h1Parent = h1El.parentElement;
      const subheadCandidates = h1Parent 
        ? Array.from(h1Parent.querySelectorAll('p, h2, .subhead, .subtitle'))
        : [];
      const subhead = subheadCandidates.length > 0 ? subheadCandidates[0].innerText : '';
      layoutSummary.hero_subheadline = subhead.slice(0, 140).trim();
    } else {
      layoutSummary.hero_h1_text = '';
      layoutSummary.hero_subheadline = '';
    }

    // Primary CTA detection (above fold - first 720px) with nav filtering
    const navBlacklist = new Set(['home', 'services', 'about']);
    const ctaKeywordRe = /\b(call|get a quote|quote|request|schedule|book|estimate|contact|emergency|24\/7)\b/i;
    const isInNav = (el) => !!el.closest('nav, [role="navigation"], .nav, .navbar, .navbar-nav, .nav-menu, .menu, .main-menu, .primary-menu, .header-menu, header nav, header .menu, header .nav-menu, header .navbar');
    const isButtonLike = (el) => {
      const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
      return el.tagName === 'BUTTON' || /btn|button|cta/.test(cls);
    };
    const getText = (el) => ((el.innerText || el.value || '') + '').trim();

    const aboveFoldCandidates = Array.from(document.querySelectorAll('a, button, input[type="submit"]'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (!(rect.top < 720 && rect.top > 0)) return false;
        if (isInNav(el)) return false;
        const text = getText(el);
        if (!text || text.length > 60) return false;
        if (navBlacklist.has(text.toLowerCase())) return false;
        const href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
        const isTel = href.toLowerCase().startsWith('tel:');
        return isTel || isButtonLike(el) || ctaKeywordRe.test(text);
      })
      .map((el) => {
        const text = getText(el);
        const href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
        const isTel = href.toLowerCase().startsWith('tel:');
        const source = isTel ? 'tel' : (isButtonLike(el) ? 'button' : 'hero');
        return { text, source };
      })
      .filter((x) => x.text);

    layoutSummary.has_primary_cta_above_fold = aboveFoldCandidates.length > 0;
    layoutSummary.primary_cta_text = aboveFoldCandidates.length > 0 ? aboveFoldCandidates[0].text : '';
    layoutSummary.primary_cta_source = aboveFoldCandidates.length > 0 ? aboveFoldCandidates[0].source : null;

    // Trust badge detection (licensed, insured, reviews, ratings, years, certified)
    const trustKeywords = ['licensed', 'insured', 'certified', 'years', 'rating', 'reviews', 'bbb', 'warranty'];
    const aboveFoldText = Array.from(document.querySelectorAll('*'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top < 720 && rect.top > 0;
      })
      .map((el) => (el.innerText || '').toLowerCase())
      .join(' ');
    
    layoutSummary.has_trust_badge_above_fold = trustKeywords.some((kw) => aboveFoldText.includes(kw));

    // Contact page detection
    const contactPageLinks = Array.from(document.querySelectorAll('a'))
      .filter((el) => (el.getAttribute('href') || '').toLowerCase().includes('contact'));
    layoutSummary.contact_page_detected = contactPageLinks.length > 0;

    // Contact form detection
    const forms = Array.from(document.querySelectorAll('form'));
    const hasContactForm = forms.some((form) => {
      const formText = (form.innerText || '').toLowerCase();
      return formText.includes('contact') || formText.includes('message') || formText.includes('email');
    });
    layoutSummary.contact_form_detected = hasContactForm;

    return {
      title,
      h1,
      h2,
      metaDescription,
      ogSiteName,
      ogImage: ogImageAbs,
      headerLogo,
      ctaCandidates,
      contactLink,
      navText,
      headingText,
      bodyText,
      layoutSummary,
      // New v2 fields
      contacts: {
        phones: phonesResult.phones,
        emails: emailsResult.emails,
        social_links: socialResult.social_links,
        address: addressHoursResult.address,
        hours: addressHoursResult.hours
      },
      contactsDebug: {
        phones: phonesResult.debug,
        emails: emailsResult.debug,
        social_links: socialResult.debug,
        address: addressHoursResult.debug.address,
        hours: addressHoursResult.debug.hours
      },
      rawDump: {
        headings: allHeadings,
        nav_items: navText,
        structured_data_jsonld: structuredData.slice(0, 3), // Limit to 3 JSON-LD blocks
        homepage_text_snippet: bodyText.slice(0, 5000), // Limit to 5000 chars
        contact_text_snippet: null // Will be filled if contact page is scraped
      }
    };
  });
  } catch (evalErr) {
    console.error('[SCRAPER] page.evaluate() failed:', evalErr.message);
    await browser.close();
    throw new Error(`Failed to extract page data: ${evalErr.message}. This usually happens if the page redirects during scraping.`);
  }

  // Parse JSON-LD for additional contact info
  const jsonLdContacts = parseJsonLdContacts(extracted.rawDump.structured_data_jsonld || []);
  
  // Contact page scraping (if detected)
  let contactPageData = null;
  if (extracted.contactLink && extracted.contactLink.trim() !== '') {
    try {
      const contactUrl = new URL(extracted.contactLink, url).href;
      await logStep(jobId, 'scrape', `Contact page detected: ${contactUrl}`);
      
      await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      contactPageData = await page.evaluate(() => {
        // Reuse the same extraction functions (simplified)
        function normalizePhoneToUS(phone) {
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
          if (digits.length === 10) return digits;
          return digits;
        }
        
        function formatPhoneDisplay(digits) {
          if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
          }
          return digits;
        }
        
        const phones = [];
        const emails = [];
        const bodyText = document.body ? document.body.innerText : '';
        
        // Extract phones from tel: links
        document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
          const href = link.getAttribute('href');
          const phone = href.replace('tel:', '').trim();
          const normalized = normalizePhoneToUS(phone);
          if (normalized.length >= 10) {
            phones.push({ value: formatPhoneDisplay(normalized), source: 'contact_page_tel_link', raw: phone });
          }
        });
        
        // Extract phones from text
        const phoneRegex = /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
        const phoneMatches = [...bodyText.matchAll(phoneRegex)];
        phoneMatches.slice(0, 3).forEach((match) => {
          const normalized = normalizePhoneToUS(match[0]);
          if (normalized.length >= 10) {
            phones.push({ value: formatPhoneDisplay(normalized), source: 'contact_page_text', raw: match[0] });
          }
        });
        
        // Extract emails from mailto: links
        document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
          const href = link.getAttribute('href');
          const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
          if (email && email.includes('@')) {
            emails.push({ value: email, source: 'contact_page_mailto_link' });
          }
        });
        
        // Extract emails from text
        const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
        const emailMatches = [...bodyText.matchAll(emailRegex)];
        emailMatches.slice(0, 3).forEach((match) => {
          const email = match[0].toLowerCase();
          if (!email.includes('example.com') && !email.includes('yourdomain')) {
            emails.push({ value: email, source: 'contact_page_text' });
          }
        });
        
        return {
          phones,
          emails,
          text_snippet: bodyText.slice(0, 2000)
        };
      });
      
      await logStep(jobId, 'scrape', `Contact page scraped: ${contactPageData.phones.length} phones, ${contactPageData.emails.length} emails`);
    } catch (err) {
      await logStep(jobId, 'scrape', `Contact page scraping failed: ${err.message}`);
      contactPageData = null;
    }
  }

  // Merge all contact sources: JSON-LD (highest priority) > tel/mailto links > text extraction > contact page
  const mergedContacts = mergeContactSources(extracted.contacts, jsonLdContacts, contactPageData);
  
  // Common placeholder/invalid emails to filter out
  const isInvalidEmail = (email) => {
    if (!email) return true;
    const lower = email.toLowerCase();
    const invalidPatterns = [
      'example.com',
      'test.com',
      'test@',
      'noreply@',
      'no-reply@',
      'admin@example',
      'info@example',
      'contact@example',
      'support@example',
      'hello@example',
      'yourname@',
      'youremail@',
      'your.email@',
      'email@domain',
      'user@domain',
      '@localhost',
      '@test',
      'sample@',
      'demo@'
    ];
    return invalidPatterns.some(pattern => lower.includes(pattern));
  };
  
  // Filter out invalid emails from mergedContacts
  mergedContacts.emails = mergedContacts.emails.filter(emailObj => {
    const email = emailObj.value || emailObj;
    if (isInvalidEmail(email)) {
      console.log(`[AUDIT V2] Filtered out invalid email: ${email}`);
      return false;
    }
    return true;
  });
  
  const bodyText = extracted.bodyText || '';
  const phoneMatch = bodyText.match(/(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  let emailMatch = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  
  // Validate emailMatch
  if (emailMatch && emailMatch[0] && isInvalidEmail(emailMatch[0])) {
    console.log(`[AUDIT V2] Filtered out invalid email from bodyText: ${emailMatch[0]}`);
    emailMatch = null;
  }
  
  // CRITICAL FALLBACK: Try preaudit results ALWAYS (not just when empty)
  // Preaudit has better email detection, so check it even if we found emails
  if (job.input_url) {
    console.log('[AUDIT V2] Checking preaudit email fallback...');
    const { getPreauditEmailByUrl } = require('../db');
    const preauditEmail = await new Promise((resolve, reject) => {
      getPreauditEmailByUrl(job.input_url, (err, email) => {
        if (err) {
          console.error('[AUDIT V2] Preaudit email fallback error:', err);
          resolve(null);
        } else {
          resolve(email);
        }
      });
    });
    
    if (preauditEmail && !isInvalidEmail(preauditEmail)) {
      console.log('[AUDIT V2] ✓ Found email from preaudit:', preauditEmail);
      
      // Check if we already have this email
      const alreadyHasEmail = mergedContacts.emails.some(e => {
        const val = e.value || e;
        return val.toLowerCase() === preauditEmail.toLowerCase();
      });
      
      if (!emailMatch && mergedContacts.emails.length === 0) {
        // No valid emails found - use preaudit as primary
        emailMatch = [preauditEmail];
        mergedContacts.emails.push({ value: preauditEmail, source: 'preaudit_fallback_primary' });
      } else if (!alreadyHasEmail) {
        // We have emails but preaudit might be better - add as alternative
        mergedContacts.emails.push({ value: preauditEmail, source: 'preaudit_fallback' });
        // If we don't have emailMatch yet, use preaudit
        if (!emailMatch) {
          emailMatch = [preauditEmail];
        }
      }
    } else {
      console.log('[AUDIT V2] No valid email found in preaudit');
    }
  }

  const ctas = extracted.ctaCandidates
    .filter((text) => /call|contact|get|estimate|quote|schedule|book|request/i.test(text))
    .slice(0, 6);

  const trustSignals = TRUST_KEYWORDS.filter((keyword) =>
    bodyText.toLowerCase().includes(keyword)
  );

  const keywordSource = []
    .concat(extracted.headingText || [])
    .concat(extracted.navText || [])
    .join(' ');

  const wordCounts = {};
  keywordSource
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word))
    .forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

  const servicesKeywords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map((entry) => entry[0]);

  const screenshotDir = path.join(getPersistentPublicDir(), 'audit_screenshots', String(jobId));
  fs.mkdirSync(screenshotDir, { recursive: true });

  // Desktop screenshots
  const aboveFoldPath = path.join(screenshotDir, 'above-fold.png');
  
  // Navigate back to homepage for screenshot
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Set desktop viewport
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: aboveFoldPath, fullPage: false });

  // Desktop full page (OPTIONAL - can be disabled to save memory)
  const ENABLE_FULLPAGE_SCREENSHOTS = process.env.ENABLE_FULLPAGE_SCREENSHOTS !== 'false';
  if (ENABLE_FULLPAGE_SCREENSHOTS) {
    const fullPagePath = path.join(screenshotDir, 'fullpage.png');
    await page.screenshot({ path: fullPagePath, fullPage: true });
  }

  // Mobile screenshots
  await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  
  const mobileAboveFoldPath = path.join(screenshotDir, 'mobile-above-fold.png');
  await page.screenshot({ path: mobileAboveFoldPath, fullPage: false });

  // Mobile full page (OPTIONAL - can be disabled to save memory)
  if (ENABLE_FULLPAGE_SCREENSHOTS) {
    const mobileFullPath = path.join(screenshotDir, 'mobile-full.png');
    await page.screenshot({ path: mobileFullPath, fullPage: true });
  }

  await browser.close();

  // Static files are served from project root (see server/server.js),
  // so public assets must be referenced with the "public/..." prefix.
  const relativeBase = path.join('public', 'audit_screenshots', String(jobId));
  
  // Update rawDump with contact page snippet if available
  if (contactPageData && contactPageData.text_snippet) {
    extracted.rawDump.contact_text_snippet = contactPageData.text_snippet;
  }

  return {
    scrapeResult: {
      title: extracted.title,
      meta_description: extracted.metaDescription,
      og_site_name: extracted.ogSiteName || null,
      og_image_url: extracted.ogImage || null,
      header_logo_url: extracted.headerLogo || null,
      h1: extracted.h1,
      h2: extracted.h2,
      ctas,
      phone: phoneMatch ? phoneMatch[0] : null,
      email: emailMatch ? emailMatch[0] : null,
      contact_url: extracted.contactLink || null,
      trust_signals: trustSignals,
      services_keywords: servicesKeywords,
      performance_summary: 'Not run',
      layout_summary: extracted.layoutSummary || {},
      // New v2 fields with merged sources
      contacts: mergedContacts,
      contacts_debug: extracted.contactsDebug
    },
    rawDump: extracted.rawDump || {},
    screenshots: {
      above_fold: path.join(relativeBase, 'above-fold.png'),
      fullpage: ENABLE_FULLPAGE_SCREENSHOTS ? path.join(relativeBase, 'fullpage.png') : null,
      mobile: path.join(relativeBase, 'mobile-above-fold.png'),
      mobile_full: ENABLE_FULLPAGE_SCREENSHOTS ? path.join(relativeBase, 'mobile-full.png') : null
    }
  };
}

/**
 * Generate Evidence Pack v2 with strict validation rules
 * This function builds a structured, LLM-ready evidence pack from raw dump data
 * with comprehensive validation and quality warnings
 */
function generateEvidencePackV2(job, crawledPages, screenshots) {
  const warnings = [];

  const homepage = crawledPages.find(p => p.page_type === 'home') || crawledPages[0];
  if (!homepage) return null;

  const contactPage = crawledPages.find(p => p.page_type === 'contact') || null;

  // Merge JSON-LD extracted data (homepage priority)
  let jsonldExtracted = homepage.jsonld_extracted_json || { organization: {}, website: {}, localbusiness: {}, offer_catalog_services: [] };
  crawledPages.forEach((p) => {
    if (!p.jsonld_extracted_json || p.url === homepage.url) return;
    const other = p.jsonld_extracted_json;
    if (other.offer_catalog_services && other.offer_catalog_services.length) {
      jsonldExtracted.offer_catalog_services = [...new Set([...(jsonldExtracted.offer_catalog_services || []), ...other.offer_catalog_services])];
    }
    if (!jsonldExtracted.localbusiness?.openingHoursSpecification && other.localbusiness?.openingHoursSpecification) {
      jsonldExtracted.localbusiness.openingHoursSpecification = other.localbusiness.openingHoursSpecification;
    }
    if (!jsonldExtracted.localbusiness?.address && other.localbusiness?.address) {
      jsonldExtracted.localbusiness.address = other.localbusiness.address;
    }
    if (!jsonldExtracted.website?.name && other.website?.name) {
      jsonldExtracted.website = jsonldExtracted.website || {};
      jsonldExtracted.website.name = other.website.name;
    }
  });

  // Helpers
  const normalizeDay = (d) => {
    const s = (d || '').toString();
    const lower = s.toLowerCase();
    if (lower.includes('monday')) return 'Mon';
    if (lower.includes('tuesday')) return 'Tue';
    if (lower.includes('wednesday')) return 'Wed';
    if (lower.includes('thursday')) return 'Thu';
    if (lower.includes('friday')) return 'Fri';
    if (lower.includes('saturday')) return 'Sat';
    if (lower.includes('sunday')) return 'Sun';
    return s.replace(/^https?:\/\/schema\.org\//i, '').slice(0, 10);
  };

  const parseOpeningHoursSpec = (spec) => {
    if (!spec) return null;
    
    // Handle string format (e.g., "Mo,Tu,We,Th,Fr,Sa,Su 07:00-19:00")
    if (typeof spec === 'string') {
      const s = spec.trim();
      // Try to parse "Mo,Tu,... HH:MM-HH:MM" pattern
      const match = s.match(/^((?:[A-Z][a-z],?\s*)+)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/i);
      if (match) {
        const daysStr = match[1];
        const opens = match[2];
        const closes = match[3];
        // Parse days: "Mo,Tu,We,..." -> ['Mon', 'Tue', 'Wed', ...]
        const daysParsed = daysStr.split(',').map(d => normalizeDay(d.trim())).filter(Boolean);
        return { days: daysParsed, opens, closes, _openingHoursString: true };
      }
      // Fallback: return as raw string if pattern doesn't match
      return { _raw: s };
    }
    
    if (!Array.isArray(spec)) return null;
    const daysSet = new Set();
    let opens = null;
    let closes = null;
    spec.forEach((row) => {
      const d = row.dayOfWeek;
      if (Array.isArray(d)) d.forEach(x => daysSet.add(normalizeDay(x)));
      else if (d) daysSet.add(normalizeDay(d));
      if (!opens && row.opens) opens = row.opens;
      if (!closes && row.closes) closes = row.closes;
    });
    const days = Array.from(daysSet);
    return { days, opens, closes };
  };

  const normalizeTime = (t) => {
    const s = (t || '').toString().trim();
    if (!s) return null;
    // Accept 00:00, 00:00:00, 23:59, 23:59:00, 24:00, 24:00:00
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return s;
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    return `${hh}:${mm}`;
  };

  const formatTimeShort = (t) => {
    const s = normalizeTime(t);
    if (!s) return '';
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return s;
    const hh = parseInt(m[1], 10);
    const mm = m[2];
    if (mm === '00') return String(hh);
    return `${hh}:${mm}`;
  };

  const formatDays = (days) => {
    const set = new Set((days || []).map(d => String(d).slice(0, 3)));
    const ordered = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hasAll = ordered.every(d => set.has(d));
    if (hasAll) return 'Mon–Sun';
    const wk = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every(d => set.has(d));
    const we = ['Sat', 'Sun'].every(d => set.has(d));
    if (wk && !we) return 'Mon–Fri';
    const present = ordered.filter(d => set.has(d));
    return present.join(', ');
  };

  const buildFormFromDetected = (forms) => {
    const usable = (forms || []).find(f => f.fields_count >= 2) || (forms || []).find(f => f.fields_count >= 1);
    if (!usable) return { contact_form_detected: false, contact_form_fields_count: 0, contact_form_fields: [], form_action_detected: null, detection_source: null };
    return {
      contact_form_detected: true,
      contact_form_fields_count: usable.fields_count || 0,
      contact_form_fields: (usable.fields || []).slice(0, 20).map(f => ({
        name: f.name || null,
        label: f.label || null,
        required: !!f.required,
        type_guess: f.type || null
      })),
      form_action_detected: usable.action || null,
      detection_source: 'dom'
    };
  };

  const detectContactFormFromText = (text) => {
    const t = (text || '').toString().toLowerCase();
    if (!t) return { detected: false, reason: null, matched: [] };
    if (t.includes('leave this field blank')) {
      return { detected: true, reason: 'honeypot', matched: ['leave this field blank'] };
    }
    const checks = [
      { key: 'name', re: /\bname\b|your name/ },
      { key: 'email', re: /\bemail\b|e-mail/ },
      { key: 'phone', re: /\bphone\b|phone number|\btel\b/ },
      { key: 'message', re: /\bmessage\b|comments?\b|question\b/ },
      { key: 'send', re: /\bsend\b/ },
      { key: 'submit', re: /\bsubmit\b/ }
    ];
    const matched = checks.filter(c => c.re.test(t)).map(c => c.key);
    const unique = new Set(matched);
    return unique.size >= 2
      ? { detected: true, reason: 'text_fields', matched: Array.from(unique) }
      : { detected: false, reason: null, matched: Array.from(unique) };
  };

  const sanitizeName = (s) => {
    const t = (s || '').toString().trim();
    if (!t) return null;
    const cleaned = t.replace(/\s+/g, ' ').slice(0, 200);
    return cleaned || null;
  };

  const deriveDomainFallback = (inputUrl) => {
    try {
      const u = new URL(inputUrl);
      const host = u.hostname.replace(/^www\./i, '');
      const parts = host.split('.').filter(Boolean);
      if (parts.length <= 1) return host;
      return parts.slice(0, -1).join('.') || host;
    } catch {
      return (inputUrl || '').toString().replace(/^https?:\/\//i, '').split('/')[0] || null;
    }
  };

  // Company name
  const pickedV2 = pickCompanyNameFromSignals({
    orgName: jsonldExtracted.organization?.name,
    localName: jsonldExtracted.localbusiness?.name,
    webName: jsonldExtracted.website?.name,
    ogSiteName: homepage.og_site_name || null,
    htmlTitle: homepage.title || null,
    inputUrl: job.input_url
  });
  const company_name = pickedV2.name;
  const company_name_source = pickedV2.source;

  // Address (allow partial, warn if no street)
  let address = null;
  const addr = jsonldExtracted.localbusiness?.address || null;
  if (addr && typeof addr === 'object' && (addr.streetAddress || addr.addressLocality || addr.addressRegion || addr.postalCode || addr.addressCountry)) {
    address = {
      street: addr.streetAddress || null,
      city: addr.addressLocality || null,
      region: addr.addressRegion || null,
      postal: addr.postalCode || null,
      country: addr.addressCountry || null,
      source: 'jsonld'
    };
    if (!address.street) {
      warnings.push({ code: 'WARN_ADDRESS_PARTIAL_MISSING_STREET', severity: 'medium', message: 'Missing full street address (partial address from JSON-LD)' });
    }
  }

  // Hours
  let hours = null;
  const hoursSpec = jsonldExtracted.localbusiness?.openingHoursSpecification || null;
  const parsedHours = parseOpeningHoursSpec(hoursSpec);
  if (parsedHours && parsedHours._raw) {
    // Fallback for unparseable string blob
    warnings.push({ code: 'WARN_HOURS_BLOB', severity: 'low', message: 'Hours came as blob string (openingHoursSpecification)' });
    const raw = (parsedHours._raw || '').toString().trim();
    if (raw) hours = { value: raw.slice(0, 500), source: 'jsonld_openingHours' };
  } else if (parsedHours) {
    const days = parsedHours.days || [];
    const opens = normalizeTime(parsedHours.opens);
    const closes = normalizeTime(parsedHours.closes);
    const source = parsedHours._openingHoursString ? 'jsonld_openingHours' : 'jsonld_openingHoursSpecification';
    const is247 =
      days && days.length >= 7 &&
      (opens === '00:00') &&
      (closes === '23:59' || closes === '24:00');
    if (is247) {
      hours = { value: '24/7', source };
    } else if (opens && closes) {
      const dayStr = formatDays(days);
      const timeStr = `${formatTimeShort(opens)}–${formatTimeShort(closes)}`;
      hours = { value: dayStr ? `${dayStr} ${timeStr}` : timeStr, source };
    } else if (days && days.length) {
      hours = { value: formatDays(days), source };
    }
  }

  // Contacts
  const extractPhonesFromText = (text) => {
    const t = (text || '').toString();
    if (!t) return [];
    const phoneRegex = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
    const matches = [...t.matchAll(phoneRegex)];
    return matches.map(m => m[0]).slice(0, 5);
  };
  
  const extractEmailsFromText = (text) => {
    const t = (text || '').toString();
    if (!t) return [];
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const matches = [...t.matchAll(emailRegex)];
    return matches.map(m => m[0].toLowerCase()).slice(0, 5);
  };
  
  // Phones: JSON-LD first, fallback to text extraction
  const phonesFromJsonLd = jsonldExtracted.organization?.contactPoint?.telephone || jsonldExtracted.localbusiness?.telephone || null;
  const phonesArray = [];
  if (phonesFromJsonLd) {
    phonesArray.push({ display: phonesFromJsonLd, e164: null, source: 'jsonld', evidence_url: homepage.url });
  }
  
  // Fallback: extract from homepage text snippet
  if (phonesArray.length === 0 && homepage.text_snippet) {
    const extracted = extractPhonesFromText(homepage.text_snippet);
    extracted.forEach(p => {
      phonesArray.push({ display: p, e164: null, source: 'homepage_text', evidence_url: homepage.url });
    });
  }
  
  // Fallback: extract from contact page text snippet
  if (phonesArray.length === 0 && contactPage && contactPage.text_snippet) {
    const extracted = extractPhonesFromText(contactPage.text_snippet);
    extracted.forEach(p => {
      phonesArray.push({ display: p, e164: null, source: 'contact_text', evidence_url: contactPage.url });
    });
  }
  
  // Emails: fallback extraction from text snippets
  const emailsArray = [];
  if (homepage.text_snippet) {
    const extracted = extractEmailsFromText(homepage.text_snippet);
    extracted.forEach(e => {
      if (!emailsArray.some(x => x.address === e)) {
        emailsArray.push({ address: e, source: 'homepage_text', evidence_url: homepage.url });
      }
    });
  }
  if (contactPage && contactPage.text_snippet) {
    const extracted = extractEmailsFromText(contactPage.text_snippet);
    extracted.forEach(e => {
      if (!emailsArray.some(x => x.address === e)) {
        emailsArray.push({ address: e, source: 'contact_text', evidence_url: contactPage.url });
      }
    });
  }
  
  const sameAs = (jsonldExtracted.organization?.sameAs || []).slice(0, 20);
  const social_links = {
    facebook: [],
    instagram: [],
    twitter: [],
    linkedin: [],
    yelp: [],
    google_maps: [],
    google_business: []
  };
  const pushUnique = (arr, obj) => {
    if (!obj || !obj.value) return;
    const v = String(obj.value);
    if (!arr.some(x => (x && x.value) === v)) arr.push({ value: v, source: obj.source || 'unknown' });
  };
  (sameAs || []).forEach((link) => {
    const v = (link || '').toString();
    const lower = v.toLowerCase();
    if (!v) return;
    if (lower.includes('facebook.com')) pushUnique(social_links.facebook, { value: v, source: 'jsonld_sameAs' });
    else if (lower.includes('instagram.com')) pushUnique(social_links.instagram, { value: v, source: 'jsonld_sameAs' });
    else if (lower.includes('twitter.com') || lower.includes('x.com')) pushUnique(social_links.twitter, { value: v, source: 'jsonld_sameAs' });
    else if (lower.includes('linkedin.com')) pushUnique(social_links.linkedin, { value: v, source: 'jsonld_sameAs' });
    else if (lower.includes('yelp.com')) pushUnique(social_links.yelp, { value: v, source: 'jsonld_sameAs' });
    else if (lower.includes('maps.google.com') || lower.includes('goo.gl/maps') || lower.includes('maps.app.goo.gl') || lower.includes('google.com/maps')) {
      pushUnique(social_links.google_maps, { value: v, source: 'jsonld_sameAs' });
    }
  });

  // Google Maps generation (no API): prefer geo, fallback to address
  const geo = jsonldExtracted.localbusiness?.geo || null;
  if ((social_links.google_maps || []).length === 0) {
    const lat = geo && geo.latitude != null ? String(geo.latitude).trim() : '';
    const lng = geo && geo.longitude != null ? String(geo.longitude).trim() : '';
    if (lat && lng) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
      pushUnique(social_links.google_maps, { value: url, source: 'generated_geo' });
    } else if (address) {
      const parts = [address.street, address.city, address.region, address.postal, address.country].filter(Boolean);
      const q = parts.join(', ');
      if (q) {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
        pushUnique(social_links.google_maps, { value: url, source: 'generated_address' });
      }
    }
  }

  // Fallback: address/hours from contact page text snippet (best-effort parsing)
  const contactText = (contactPage && contactPage.text_snippet) ? contactPage.text_snippet : '';
  if (!address && contactText) {
    const m = contactText.match(/\b([A-Za-z][A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})\b/);
    if (m) {
      address = { street: null, city: m[1].trim(), region: m[2], postal: m[3], country: null, source: 'page_text' };
      warnings.push({ code: 'WARN_ADDRESS_PARTIAL_FROM_TEXT', severity: 'low', message: 'Address inferred from contact page text (partial)' });
    }
  }
  if (!hours && contactText) {
    // Simple time range extraction (e.g., 07:00–19:00)
    const tm = contactText.match(/(\d{1,2}:\d{2})\s*(?:-|–|to)\s*(\d{1,2}:\d{2})/);
    if (tm) {
      hours = { value: `${tm[1]}–${tm[2]}`, source: 'page_text' };
      warnings.push({ code: 'WARN_HOURS_FROM_TEXT', severity: 'low', message: 'Hours inferred from contact page text (lower confidence)' });
    }
  }

  // Services: featured + other_services (from extracted page services)
  const servicesFeatured = [];
  const servicesOther = [];
  crawledPages.forEach((p) => {
    const ex = p.services_extracted_json || {};
    (ex.featured || []).forEach((s) => {
      if (s && s.title) {
        servicesFeatured.push({
          title: s.title,
          description: s.description || '',
          learn_more_href: s.learn_more_href || null,
          source_page_url: p.url
        });
      }
    });
    (ex.other_services || []).forEach((t) => {
      if (t) servicesOther.push(t);
    });
  });
  
  // Fallback: extract services from H3/H6 pattern when empty
  if (servicesFeatured.length === 0) {
    crawledPages.forEach((p) => {
      const h3s = p.h3_json || [];
      const h6s = p.h6_json || [];
      
      // Match H3 + nearby H6 pattern (service name + description)
      h3s.slice(0, 20).forEach((h3, idx) => {
        const title = String(h3 || '').trim();
        if (!title || title.length < 3 || title.length > 100) return;
        
        // Check if this looks like a service (keywords: repair, install, service, maintenance, etc.)
        const lower = title.toLowerCase();
        const serviceKeywords = /repair|install|service|maintenance|replacement|inspection|cleaning|plumbing|drain|sewer|water|pump|tank|heater/;
        if (!serviceKeywords.test(lower)) return;
        
        // Look for H6 as description (if nearby index)
        let description = '';
        if (h6s[idx]) description = String(h6s[idx] || '').trim().slice(0, 220);
        
        servicesFeatured.push({
          title,
          description,
          learn_more_href: null,
          source_page_url: p.url
        });
      });
    });
  }

  // service areas (jsonld)
  const service_areas = (jsonldExtracted.localbusiness?.areaServed || []).slice(0, 20);

  // CTA candidates + primary
  const validIntents = new Set(['call', 'schedule', 'book', 'estimate', 'quote', 'contact']);
  const normTxt = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  const navBlacklist = new Set(['home', 'services', 'about']);
  const inferIntent = (text, href) => {
    const t = normTxt(text);
    const h = (href || '').toString().toLowerCase();
    if (!t && !h) return null;
    if (h.startsWith('tel:') || /\bcall\b|\bemergency\b|\b24\/7\b/.test(t)) return 'call';
    if (/\b(get a quote|quote|request a quote|pricing|price)\b/.test(t)) return 'quote';
    if (/\b(estimate|request an estimate)\b/.test(t)) return 'estimate';
    if (/\b(schedule|appointment)\b/.test(t)) return 'schedule';
    if (/\bbook\b/.test(t)) return 'book';
    if (/\bcontact\b|\bget in touch\b/.test(t) || h.startsWith('mailto:')) return 'contact';
    return null;
  };
  const isButtonLike = (c) => {
    const sel = (c && c.dom_debug_selector) ? String(c.dom_debug_selector).toLowerCase() : '';
    return sel.startsWith('button') || sel.includes('.btn') || sel.includes('.button') || sel.includes('.cta');
  };
  let allCtas = (crawledPages.flatMap(p => p.cta_candidates_json || []) || [])
    .filter(c => c && c.text)
    .filter(c => !c.is_in_nav)
    .filter(c => !navBlacklist.has(normTxt(c.text)));
  
  // Fallback: if no CTA candidates, generate from phones (tel: links) and headings
  if (allCtas.length === 0) {
    const fallbackCtas = [];
    
    // Generate tel: CTA from phones
    if (phonesArray.length > 0) {
      phonesArray.slice(0, 2).forEach(p => {
        fallbackCtas.push({
          text: `Call ${p.display}`,
          href: `tel:${p.display}`,
          cta_intent: 'call',
          target_type: 'tel',
          is_above_fold_desktop: true,
          is_above_fold_mobile: true,
          page_url: p.evidence_url || homepage.url,
          dom_debug_selector: 'generated_tel',
          is_in_nav: false
        });
      });
    }
    
    // Extract text CTAs from headings (H3/H6 with "Free", "Get", "Request", "Schedule", etc.)
    crawledPages.forEach(p => {
      const headings = [...(p.h3_json || []), ...(p.h6_json || [])].slice(0, 10);
      headings.forEach(h => {
        const t = String(h || '').trim();
        if (t.length < 10 || t.length > 100) return;
        const lower = t.toLowerCase();
        if (/\b(free|get|request|schedule|book|contact|call|estimate|quote)\b/.test(lower)) {
          fallbackCtas.push({
            text: t,
            href: null,
            cta_intent: null,
            target_type: 'text',
            is_above_fold_desktop: false,
            is_above_fold_mobile: false,
            page_url: p.url,
            dom_debug_selector: 'heading_text',
            is_in_nav: false
          });
        }
      });
    });
    
    allCtas = fallbackCtas;
  }

  const scored = allCtas
    .map((c) => {
      const derivedIntent = validIntents.has(c.cta_intent) ? c.cta_intent : inferIntent(c.text, c.href);
      const aboveFold = !!(c.is_above_fold_desktop || c.is_above_fold_mobile);
      const tel = c.target_type === 'tel' || (c.href || '').toString().toLowerCase().startsWith('tel:');
      const btn = isButtonLike(c);
      const score = (aboveFold ? 50 : 0) + (tel ? 40 : 0) + (btn ? 20 : 0) + (derivedIntent ? 10 : 0);
      return { c, derivedIntent, aboveFold, tel, btn, score };
    })
    .filter(x => x.derivedIntent && x.aboveFold)
    .sort((a, b) => b.score - a.score);

  const primaryPick = scored[0] || null;
  const primary = primaryPick ? primaryPick.c : null;
  const primary_intent = primaryPick ? primaryPick.derivedIntent : null;
  const primary_cta_source = primaryPick
    ? (primaryPick.tel ? 'tel' : (primaryPick.btn ? 'button' : 'hero'))
    : null;
  const cta_map = {
    primary: primary
      ? { text: primary.text, intent: primary_intent, href: primary.href, source: primary_cta_source, evidence: { page_url: primary.page_url, selector: primary.dom_debug_selector } }
      : null,
    primary_cta_text: primary ? primary.text : null,
    primary_cta_source,
    primary_cta_reason: primary ? 'above_fold + intent + not_in_nav + nav_blacklist' : null,
    cta_candidates: allCtas.slice(0, 40).map(c => ({
      text: c.text,
      href: c.href,
      intent: validIntents.has(c.cta_intent) ? c.cta_intent : inferIntent(c.text, c.href) || c.cta_intent,
      target_type: c.target_type,
      above_fold_desktop: !!c.is_above_fold_desktop,
      above_fold_mobile: !!c.is_above_fold_mobile,
      evidence: { page_url: c.page_url, selector: c.dom_debug_selector }
    }))
  };
  if (cta_map.primary && !validIntents.has(cta_map.primary.intent)) {
    warnings.push({ code: 'WARN_PRIMARY_CTA_NOT_INTENT', severity: 'high', message: 'Primary CTA intent not allowed' });
  }

  // Contact form detection (DOM forms; best-effort)
  const allForms = crawledPages.flatMap(p => p.forms_detailed_json || []);
  const contactForms = (contactPage && contactPage.url)
    ? allForms.filter(f => (f.page_url || '').toString() === contactPage.url || (f.page_url || '').toString().toLowerCase().includes('contact'))
    : allForms.filter(f => (f.page_url || '').toString().toLowerCase().includes('contact'));
  let formPack = buildFormFromDetected(contactForms.length ? contactForms : allForms);
  if (!formPack.contact_form_detected) {
    // Fallback 1: page-level signal from crawler (any <form> in DOM)
    const contactHasForm = !!(contactPage && contactPage.has_form);
    if (contactHasForm) {
      warnings.push({ code: 'WARN_CONTACT_FORM_DETECTED_VIA_TEXT', severity: 'low', message: 'Contact form detected via text snippet (lower confidence, possibly JS-rendered)' });
      formPack = {
        contact_form_detected: true,
        contact_form_fields_count: 0,
        contact_form_fields: [
          { name: null, label: 'Form detected', required: false, type_guess: null }
        ],
        form_action_detected: null,
        detection_source: 'dom_has_form'
      };
    } else {
      // Fallback 2: heuristic detection from contact page text snippet (robust when DOM parsing fails)
      const txt = (contactPage && contactPage.text_snippet) ? contactPage.text_snippet : '';
      const d = detectContactFormFromText(txt);
      if (d.detected) {
        warnings.push({ code: 'WARN_CONTACT_FORM_DETECTED_VIA_TEXT', severity: 'low', message: `Contact form detected via text snippet (${d.reason})` });
        formPack = {
          contact_form_detected: true,
          contact_form_fields_count: 0,
          contact_form_fields: (d.matched || []).slice(0, 8).map(k => ({ name: null, label: k, required: false, type_guess: null })),
          form_action_detected: null,
          detection_source: 'text'
        };
      }
    }
  }

  // Trust evidence: years + 1 review snippet (from extracted trust_extracted_json or body snippet)
  const trustEvidence = [];
  const yearsSnippet =
    homepage.trust_extracted_json?.years_in_business_snippet ||
    (homepage.text_snippet || '').match(/(over\s+)?(\d{1,2})\+?\s*(years?|yrs?)\b/i)?.[0] ||
    null;
  if (yearsSnippet) {
    trustEvidence.push({ type: 'years_in_business', value: yearsSnippet, snippet: yearsSnippet, source: 'homepage_text_snippet' });
  }
  const reviewFromExtracted = (homepage.trust_extracted_json?.review_snippets || [])[0] || null;
  if (reviewFromExtracted) {
    trustEvidence.push({ type: 'review_snippet', snippet: reviewFromExtracted, source: 'homepage_text_snippet' });
  }
  if (trustEvidence.length === 0) {
    warnings.push({ code: 'WARN_TRUST_HAS_NO_NUMBERS_OR_LICENSE', severity: 'medium', message: 'Trust evidence missing years/reviews/ratings' });
  }

  // Brand assets: choose best logo candidate deterministically by priority_score (already computed)
  const logoCandidates = crawledPages.flatMap(p => p.brand_assets_json?.logo_candidates || []);
  const logoBest = logoCandidates.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))[0] || null;
  const normalizeLogoSource = (src) => {
    const s = (src || '').toString();
    if (!s) return null;
    if (s === 'jsonld_org_logo') return 'jsonld_organization';
    if (s === 'jsonld_localbusiness_image') return 'jsonld_localbusiness';
    if (s === 'og_image') return 'og_image';
    if (s === 'header_img' || s === 'header_svg') return 'header_logo';
    return s;
  };
  let logo_url = null;
  let logo_source = null;
  if (logoBest && logoBest.url) {
    logo_url = logoBest.url;
    logo_source = normalizeLogoSource(logoBest.source);
  } else if (jsonldExtracted.organization?.logo) {
    logo_url = jsonldExtracted.organization.logo;
    logo_source = 'jsonld_organization';
  } else if (jsonldExtracted.localbusiness?.image) {
    logo_url = jsonldExtracted.localbusiness.image;
    logo_source = 'jsonld_localbusiness';
  }
  const brand_assets = {
    detected_logo: logoBest
      ? { url: logoBest.url, source: normalizeLogoSource(logoBest.source), source_raw: logoBest.source, local_path: null, width: logoBest.width || null, height: logoBest.height || null }
      : null
  };

  // Data quality warnings extras
  if (brand_assets.detected_logo && (brand_assets.detected_logo.width && brand_assets.detected_logo.width < 80)) {
    warnings.push({ code: 'WARN_LOGO_LOW_RES', severity: 'low', message: 'Logo detected but seems low resolution' });
  }

  return {
    niche: job.niche,
    city: job.city,
    input_url: job.input_url,
    company_name,
    company_name_source,
    company_profile: {
      name: company_name,
      phones: phonesArray.slice(0, 5),
      emails: emailsArray.slice(0, 5),
      address: address ? { ...address, evidence_url: homepage.url } : null,
      hours: hours ? { ...hours, evidence_url: homepage.url } : null,
      social_links
    },
    logo_url,
    logo_source,
    contact_form: formPack,
    cta_map,
    services: {
      featured: servicesFeatured.slice(0, 20),
      other_services: [...new Set(servicesOther)].slice(0, 60),
      service_areas: service_areas.slice(0, 20)
    },
    trust: {
      evidence: trustEvidence.slice(0, 8)
    },
    brand_assets,
    data_quality_warnings: warnings,
    screenshots_available: {
      above_fold: screenshots && screenshots.above_fold ? true : false,
      fullpage: screenshots && screenshots.fullpage ? true : false
    },
    version: 'v2'
  };
}

function generateEvidencePack(job, scrapeResult, rawDump, screenshots) {
  // Generate Evidence Pack for LLM (Scraper v2)
  // This is the ONLY data that goes to LLM evaluators
  
  const contacts = scrapeResult.contacts || {};
  const layoutSummary = scrapeResult.layout_summary || {};
  
  // Company profile from extracted contacts
  const companyProfile = {
    name: null,
    phones: contacts.phones || [],
    emails: contacts.emails || [],
    address: contacts.address || null,
    hours: contacts.hours || null,
    social_links: contacts.social_links || {}
  };

  // Company name (deterministic; keep consistent with Evidence Pack v2)
  const sanitizeName = (s) => {
    const t = (s || '').toString().trim();
    if (!t) return null;
    const cleaned = t.replace(/\s+/g, ' ').slice(0, 200);
    return cleaned || null;
  };
  const deriveDomainFallback = (inputUrl) => {
    try {
      const u = new URL(inputUrl);
      const host = u.hostname.replace(/^www\./i, '');
      const parts = host.split('.').filter(Boolean);
      if (parts.length <= 1) return host;
      return parts.slice(0, -1).join('.') || host;
    } catch {
      return (inputUrl || '').toString().replace(/^https?:\/\//i, '').split('/')[0] || null;
    }
  };
  const jsonldBlocks = rawDump.structured_data_jsonld || [];
  const jsonldMeta = parseJsonLdContacts(jsonldBlocks) || {};
  const pickedV1 = pickCompanyNameFromSignals({
    orgName: jsonldMeta.organization_name,
    localName: jsonldMeta.localbusiness_name,
    webName: jsonldMeta.website_name,
    ogSiteName: scrapeResult.og_site_name || scrapeResult.ogSiteName || null,
    htmlTitle: scrapeResult.title || null,
    inputUrl: job.input_url
  });
  const company_name = pickedV1.name;
  const company_name_source = pickedV1.source;

  companyProfile.name = company_name;

  // Logo (v1 pack): JSON-LD logo first (org/localbusiness), then keep as null (no extra API/crawl)
  let logo_url = jsonldMeta.logo_url ? String(jsonldMeta.logo_url) : null;
  let logo_source = jsonldMeta.logo_source ? String(jsonldMeta.logo_source) : null;
  if (!logo_url) {
    if (scrapeResult.og_image_url) {
      logo_url = String(scrapeResult.og_image_url);
      logo_source = 'og_image';
    } else if (scrapeResult.header_logo_url) {
      logo_url = String(scrapeResult.header_logo_url);
      logo_source = 'header_logo';
    }
  }

  // Google Maps generation (no API) for v1 pack
  if (!companyProfile.social_links || typeof companyProfile.social_links !== 'object' || Array.isArray(companyProfile.social_links)) {
    companyProfile.social_links = {};
  }
  if (!Array.isArray(companyProfile.social_links.google_maps)) {
    companyProfile.social_links.google_maps = [];
  }
  if (companyProfile.social_links.google_maps.length === 0) {
    const addrText =
      (contacts.address && typeof contacts.address === 'object' && contacts.address.value) ? contacts.address.value :
      (typeof contacts.address === 'string' ? contacts.address : null);
    const q = (addrText || '').toString().trim();
    if (q) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      companyProfile.social_links.google_maps.push({ value: url, source: 'generated_address' });
    }
  }
  
  // Service offers from headings and nav (top 5)
  const headings = (rawDump.headings || []).map(h => h.text).slice(0, 10);
  const navItems = (rawDump.nav_items || []).slice(0, 10);
  const serviceOffers = [...new Set([...headings, ...navItems])]
    .filter(text => text.length > 3 && text.length < 100)
    .slice(0, 5);
  
  // Trust snippets (top 5 specific snippets)
  const trustSnippets = [];
  
  // Add trust signals with context
  (scrapeResult.trust_signals || []).forEach((signal) => {
    trustSnippets.push(`Trust signal found: "${signal}"`);
  });
  
  // Check for specific trust indicators
  if (layoutSummary.has_trust_badge_above_fold) {
    trustSnippets.push('Trust badge visible above the fold');
  }
  
  // Add more context from structured data if available
  const structuredData = rawDump.structured_data_jsonld || [];
  structuredData.forEach((data) => {
    if (data['@type'] === 'LocalBusiness' && data.aggregateRating) {
      trustSnippets.push(`Structured data shows rating: ${data.aggregateRating.ratingValue || 'N/A'}`);
    }
  });
  
  const limitedTrustSnippets = trustSnippets.slice(0, 5);
  
  // CTA map (primary/secondary + text + location)
  const ctaMap = {
    primary: {
      text: layoutSummary.primary_cta_text || '',
      location: layoutSummary.has_primary_cta_above_fold ? 'above_fold' : 'unknown',
      exists: layoutSummary.has_primary_cta_above_fold || false,
      source: layoutSummary.primary_cta_source || null
    },
    primary_cta_text: layoutSummary.primary_cta_text || '',
    primary_cta_source: layoutSummary.primary_cta_source || null,
    secondary: {
      texts: (scrapeResult.ctas || []).slice(1, 3), // Next 2 CTAs
      exists: (scrapeResult.ctas || []).length > 1
    },
    all_ctas: (scrapeResult.ctas || []).slice(0, 6) // Top 6 CTAs
  };
  
  // Contact friction (tel clickable, clicks-to-contact)
  const detectContactFormFromText = (text) => {
    const t = (text || '').toString().toLowerCase();
    if (!t) return { detected: false, reason: null, matched: [] };
    if (t.includes('leave this field blank')) return { detected: true, reason: 'honeypot', matched: ['leave this field blank'] };
    const checks = [
      { key: 'name', re: /\bname\b|your name/ },
      { key: 'email', re: /\bemail\b|e-mail/ },
      { key: 'phone', re: /\bphone\b|phone number|\btel\b/ },
      { key: 'message', re: /\bmessage\b|comments?\b|question\b/ },
      { key: 'send', re: /\bsend\b/ },
      { key: 'submit', re: /\bsubmit\b/ }
    ];
    const matched = checks.filter(c => c.re.test(t)).map(c => c.key);
    return new Set(matched).size >= 2
      ? { detected: true, reason: 'text_fields', matched: Array.from(new Set(matched)) }
      : { detected: false, reason: null, matched: Array.from(new Set(matched)) };
  };
  const contactFormFromContactText = detectContactFormFromText(rawDump.contact_text_snippet || '');
  const contact_form_detected = (layoutSummary.contact_form_detected || false) || !!contactFormFromContactText.detected;

  const contactFriction = {
    phone_in_header: layoutSummary.has_phone_in_header || false,
    phone_clickable: layoutSummary.phone_clickable_tel_link || false,
    phones_found: (contacts.phones || []).length,
    emails_found: (contacts.emails || []).length,
    contact_page_detected: layoutSummary.contact_page_detected || false,
    contact_form_detected,
    clicks_to_contact: calculateClicksToContact({ ...layoutSummary, contact_form_detected }, contacts)
  };
  
  // Layout summary (already exists)
  const layoutSummaryClean = {
    hero_h1_text: layoutSummary.hero_h1_text || '',
    hero_subheadline: layoutSummary.hero_subheadline || '',
    has_primary_cta_above_fold: layoutSummary.has_primary_cta_above_fold || false,
    has_trust_badge_above_fold: layoutSummary.has_trust_badge_above_fold || false,
    has_phone_in_header: layoutSummary.has_phone_in_header || false,
    phone_clickable_tel_link: layoutSummary.phone_clickable_tel_link || false,
    contact_page_detected: layoutSummary.contact_page_detected || false,
    contact_form_detected
  };
  
  return {
    // Job context
    niche: job.niche,
    city: job.city,
    input_url: job.input_url,
    company_name,
    company_name_source,
    logo_url,
    logo_source,
    
    // Evidence Pack v2
    company_profile: companyProfile,
    service_offers: serviceOffers,
    trust_snippets: limitedTrustSnippets,
    cta_map: ctaMap,
    contact_friction: contactFriction,
    layout_summary: layoutSummaryClean,
    
    // Meta
    screenshots_available: {
      above_fold: screenshots && screenshots.above_fold ? true : false,
      fullpage: screenshots && screenshots.fullpage ? true : false
    }
  };
}

function calculateClicksToContact(layoutSummary, contacts) {
  // Calculate minimum clicks needed to contact the business
  
  // If phone is clickable in header: 1 click (best case)
  if (layoutSummary.phone_clickable_tel_link && layoutSummary.has_phone_in_header) {
    return 1;
  }
  
  // If phone is visible in header but not clickable: 0 clicks (can call directly)
  if (layoutSummary.has_phone_in_header && (contacts.phones || []).length > 0) {
    return 0; // Can see and dial manually
  }
  
  // If contact page exists: 1 click
  if (layoutSummary.contact_page_detected) {
    return 1;
  }
  
  // If contact form is on homepage: 0 clicks (can fill immediately)
  if (layoutSummary.contact_form_detected) {
    return 0;
  }
  
  // If we found emails or phones elsewhere: estimate 2 clicks (scroll + find)
  if ((contacts.phones || []).length > 0 || (contacts.emails || []).length > 0) {
    return 2;
  }
  
  // Otherwise: unknown, assume 3+ clicks
  return 3;
}

function buildLlmInput(job, scrapeResult, screenshots, evidencePack) {
  // V2: Use evidence pack ONLY for LLM input
  // Keep old structure for backwards compatibility, but prefer evidence_pack
  
  if (evidencePack) {
    return evidencePack;
  }
  
  // Fallback to old structure if evidence pack not available
  return {
    niche: job.niche,
    city: job.city,
    input_url: job.input_url,
    company_name: job.company_name,
    scrape_result_json: {
      // Primary signals for LLM
      layout_summary: scrapeResult.layout_summary || {},
      trust_snippets: {
        trust_signals: scrapeResult.trust_signals || [],
        has_trust_above_fold: (scrapeResult.layout_summary || {}).has_trust_badge_above_fold || false
      },
      cta_analysis: {
        primary_cta_text: (scrapeResult.layout_summary || {}).primary_cta_text || '',
        has_cta_above_fold: (scrapeResult.layout_summary || {}).has_primary_cta_above_fold || false,
        all_ctas: scrapeResult.ctas || []
      },
      contact_friction: {
        phone: scrapeResult.phone || null,
        phone_in_header: (scrapeResult.layout_summary || {}).has_phone_in_header || false,
        phone_clickable: (scrapeResult.layout_summary || {}).phone_clickable_tel_link || false,
        email: scrapeResult.email || null,
        contact_url: scrapeResult.contact_url || null,
        contact_page_detected: (scrapeResult.layout_summary || {}).contact_page_detected || false,
        contact_form_detected: (scrapeResult.layout_summary || {}).contact_form_detected || false
      },
      hero_content: {
        h1: scrapeResult.h1 || '',
        hero_h1_text: (scrapeResult.layout_summary || {}).hero_h1_text || '',
        hero_subheadline: (scrapeResult.layout_summary || {}).hero_subheadline || '',
        meta_description: scrapeResult.meta_description || ''
      },
      // Secondary signals (for context only, not primary evidence)
      service_offers: {
        h2_headings: scrapeResult.h2 || [],
        keywords: scrapeResult.services_keywords || []
      }
    },
    screenshots_available: {
      above_fold: screenshots && screenshots.above_fold ? true : false,
      fullpage: screenshots && screenshots.fullpage ? true : false
    }
  };
}

async function runLlmEvaluators(job, scrapeResult, screenshots, rawDump, evidencePack, options) {
  const prompts = await ensureDefaultPrompts();
  const promptOverrides = options.promptOverrides || {};
  const settings = options.settings || {};

  // Load all assistants from database
  const assistants = await new Promise((resolve, reject) => {
    getAllAssistants((err, data) => {
      if (err) {
        console.error('Error loading assistants, using defaults:', err);
        // Fallback to old hardcoded system if DB fails
        resolve([]);
      } else {
        resolve(data || []);
      }
    });
  });

  // V2: Try to use Evidence Pack v2 first (from job.evidence_pack_v2_json), then v1, then fallback
  let llmInput = evidencePack;
  if (job.evidence_pack_v2_json) {
    try {
      llmInput = typeof job.evidence_pack_v2_json === 'string' ? JSON.parse(job.evidence_pack_v2_json) : job.evidence_pack_v2_json;
      console.log('[LLM] Using Evidence Pack v2 for evaluation');
    } catch (e) {
      console.error('[LLM] Failed to parse Evidence Pack v2, falling back to v1');
    }
  }
  if (!llmInput) {
    llmInput = evidencePack || buildLlmInput(job, scrapeResult, screenshots, null);
  }
  
  const sharedContext = `Input JSON:\n${JSON.stringify(llmInput, null, 2)}`;

  // Initialize results object
  const assistantResults = {};
  const llmSnapshot = {
    settings: {},
    prompts: {},
    assistants: []
  };

  // If no assistants in DB, use legacy hardcoded system for backward compatibility
  if (assistants.length === 0) {
    console.log('No assistants found in DB, using legacy hardcoded system');
    
    const uxModel = settings.ux_model || 'openai/gpt-4.1-mini';
    const uxTemperature = Number.isFinite(settings.ux_temperature) ? settings.ux_temperature : 0.3;
    const webModel = settings.web_model || 'openai/gpt-4.1-mini';
    const webTemperature = Number.isFinite(settings.web_temperature) ? settings.web_temperature : 0.3;

    const uxPrompt = sanitizeText(promptOverrides.ux || prompts.ux_specialist.content);
    const webPrompt = sanitizeText(promptOverrides.web || prompts.web_designer.content);

    const uxResponse = await callOpenRouter({
      model: uxModel,
      temperature: uxTemperature,
      messages: [
        { role: 'system', content: uxPrompt },
        { role: 'user', content: sharedContext }
      ]
    });

    const webResponse = await callOpenRouter({
      model: webModel,
      temperature: webTemperature,
      messages: [
        { role: 'system', content: webPrompt },
        { role: 'user', content: sharedContext }
      ]
    });

    const uxJson = parseJsonFromText(uxResponse);
    const webJson = parseJsonFromText(webResponse);

    assertCompliantJson(uxJson);
    assertCompliantJson(webJson);
    validateEvidenceInIssues(uxJson);

    const miniAudit = {
      top_3_leaks: uxJson.top_3_leaks || [],
      seven_day_plan: uxJson['7_day_plan'] || uxJson.seven_day_plan || [],
      copy_suggestions: webJson.copy_suggestions || [],
      concept_headline: webJson.concept_headline || '',
      concept_subhead: webJson.concept_subhead || '',
      tone: uxJson.tone || webJson.tone || ''
    };

    llmSnapshot.settings = {
      ux_model: uxModel,
      ux_temperature: uxTemperature,
      web_model: webModel,
      web_temperature: webTemperature,
      email_model: settings.email_model || 'openai/gpt-4.1-mini',
      email_temperature: Number.isFinite(settings.email_temperature) ? settings.email_temperature : 0.2
    };
    llmSnapshot.prompts = {
      ux_specialist: { name: 'ux_specialist', version: prompts.ux_specialist.version || null },
      web_designer: { name: 'web_designer', version: prompts.web_designer.version || null }
    };

    return { miniAudit, llmSnapshot };
  }

  // New dynamic assistant system
  for (const assistant of assistants) {
    const model = settings[`${assistant.key}_model`] || assistant.model;
    const temperature = Number.isFinite(settings[`${assistant.key}_temperature`]) 
      ? settings[`${assistant.key}_temperature`] 
      : assistant.temperature;
    const prompt = sanitizeText(promptOverrides[assistant.key] || assistant.prompt);

    console.log(`Running assistant: ${assistant.name} (${assistant.key}) with model ${model}`);

    try {
      const response = await callOpenRouter({
        model,
        temperature,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: sharedContext }
        ]
      });

      const resultJson = parseJsonFromText(response);
      assertCompliantJson(resultJson);

      // Store result with assistant key
      assistantResults[assistant.key] = resultJson;

      // Track in snapshot
      llmSnapshot.settings[`${assistant.key}_model`] = model;
      llmSnapshot.settings[`${assistant.key}_temperature`] = temperature;
      llmSnapshot.assistants.push({
        id: assistant.id,
        key: assistant.key,
        name: assistant.name,
        model: model,
        temperature: temperature
      });
    } catch (error) {
      console.error(`Error running assistant ${assistant.name}:`, error);
      assistantResults[assistant.key] = { error: error.message };
    }
  }

  // Build miniAudit - try to maintain backward compatibility
  const uxResult = assistantResults['ux_specialist'] || {};
  const webResult = assistantResults['web_designer'] || {};

  // Validate UX results if available
  if (uxResult.top_3_leaks) {
    try {
      validateEvidenceInIssues(uxResult);
    } catch (error) {
      console.error('Evidence validation failed:', error);
    }
  }

  const miniAudit = {
    top_3_leaks: uxResult.top_3_leaks || [],
    seven_day_plan: uxResult['7_day_plan'] || uxResult.seven_day_plan || [],
    copy_suggestions: webResult.copy_suggestions || [],
    concept_headline: webResult.concept_headline || '',
    concept_subhead: webResult.concept_subhead || '',
    tone: uxResult.tone || webResult.tone || '',
    // Store all assistant results for future use
    assistant_results: assistantResults
  };

  return { miniAudit, llmSnapshot };
}

async function runEmailPolish(job, miniAudit, options) {
  const prompts = await ensureDefaultPrompts();
  const promptOverrides = options.promptOverrides || {};
  const settings = options.settings || {};
  const model = settings.email_model || 'openai/gpt-4.1-mini';
  const temperature = Number.isFinite(settings.email_temperature) ? settings.email_temperature : 0.2;

  const emailPrompt = sanitizeText(promptOverrides.email || prompts.email_copy.content);
  if (!emailPrompt) {
    return null;
  }

  const context = `Mini audit:\n${JSON.stringify(miniAudit, null, 2)}`;
  const response = await callOpenRouter({
    model,
    temperature,
    messages: [
      { role: 'system', content: emailPrompt },
      { role: 'user', content: context }
    ]
  });

  const emailJson = parseJsonFromText(response);
  assertCompliantJson(emailJson);
  return emailJson;
}

function generatePublicSlug(job) {
  // CRITICAL: Must have niche to generate proper slug!
  // This error will bubble up and be shown to admin in UI
  if (!job.niche) {
    throw new Error(`❌ Cannot send email: Audit ${job.id} is missing required 'niche' field. Please add niche in admin before sending email.`);
  }
  
  const niche = job.niche.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Fallback for city if not available yet (will be updated after scrape)
  let city = 'local';
  if (job.city && String(job.city).trim()) {
    city = job.city.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  const companySeed = job.company_name
    ? job.company_name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
    : 'audit';
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `${niche}${city}/${companySeed}-${randomSuffix}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAuditLandingUrlFromSlug(publicSlug, auditId = null) {
  if (!publicSlug) return null;
  let url = `https://maxandjacob.com/${publicSlug}?v=2`;
  if (auditId) {
    url += `&audit_id=${auditId}`;
  }
  return url;
}

/**
 * Ensures the email contains a clean, human-readable audit link block:
 * "Audit - Company Name" (bold) + clickable full URL beneath.
 *
 * This is deterministic post-processing so we don't rely on LLM formatting.
 */
function ensureAuditLinkBlockInEmailHtml(emailHtmlRaw, { publicSlug, auditUrl, companyLabel }) {
  if (!emailHtmlRaw) return emailHtmlRaw;
  if (!auditUrl) return emailHtmlRaw;

  const label = companyLabel ? `Audit - ${companyLabel}` : 'Audit';
  const block =
    `<p style="margin: 20px 0;">` +
    `<strong style="font-size: 16px;">${escapeHtml(label)}</strong><br>` +
    `<a href="${escapeHtml(auditUrl)}" style="color: #4F46E5; text-decoration: none;">${escapeHtml(auditUrl)}</a>` +
    `</p>`;

  let html = String(emailHtmlRaw);

  // If the email is plaintext-like, wrap it so it renders as HTML but keeps line breaks.
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(html);
  if (!looksLikeHtml) {
    html = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(html)}</div>`;
  }

  // Replace the first occurrence of the audit URL (or relative slug) with our clean block.
  const candidates = [];
  if (publicSlug) {
    const rel = `/${publicSlug}`;
    candidates.push(getAuditLandingUrlFromSlug(publicSlug));
    candidates.push(`https://maxandjacob.com/${publicSlug}`);
    candidates.push(`${rel}?v=2`);
    candidates.push(rel);
  }
  candidates.push(auditUrl);

  for (const c of candidates) {
    if (!c) continue;
    const idx = html.indexOf(c);
    if (idx !== -1) {
      html = html.replace(c, block);
      return html;
    }
  }

  // Fallback: append at the end.
  return `${html}\n${block}`;
}

/**
 * Download and store logo locally
 * Validates content type and size, stores in public/brand_assets/<jobId>/logo.<ext>
 */
async function downloadAndStoreLogo(logoUrl, jobId) {
  if (!logoUrl || logoUrl.startsWith('inline-svg-')) {
    return null; // Skip inline SVGs and null URLs
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(logoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MaxAndJacob-Audit/1.0)'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`[LOGO DOWNLOAD] Failed to download ${logoUrl}: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    
    // Validate content type
    if (!contentType.startsWith('image/')) {
      console.error(`[LOGO DOWNLOAD] Invalid content type: ${contentType}`);
      return null;
    }
    
    // Validate size (max 4MB)
    if (contentLength > 4 * 1024 * 1024) {
      console.error(`[LOGO DOWNLOAD] Logo too large: ${contentLength} bytes`);
      return null;
    }
    
    // Determine extension
    let ext = 'png'; // default
    if (contentType.includes('svg')) {
      ext = 'svg';
    } else if (contentType.includes('png')) {
      ext = 'png';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      ext = 'jpg';
    } else if (contentType.includes('webp')) {
      ext = 'webp';
    }
    
    // Create directory (spec: public/brand_assets/<jobId>/logo.ext)
    const dir = path.join(getPersistentPublicDir(), 'brand_assets', String(jobId));
    fs.mkdirSync(dir, { recursive: true });
    
    // Save file
    const filename = `logo.${ext}`;
    const filepath = path.join(dir, filename);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    
    console.log(`[LOGO DOWNLOAD] Successfully saved logo to ${filepath}`);
    
    return {
      stored_path: `public/brand_assets/${jobId}/${filename}`,
      public_url: `/public/brand_assets/${jobId}/${filename}`,
      format: ext,
      size_bytes: buffer.byteLength
    };
  } catch (error) {
    console.error(`[LOGO DOWNLOAD] Error downloading logo from ${logoUrl}:`, error.message);
    return null;
  }
}

async function generateConceptPreview(job, miniAudit, preset = null) {
  return {
    label: 'Concept preview (not your current website)',
    headline: preset && preset.default_headline 
      ? preset.default_headline.replace('{city}', job.city).replace('{niche}', job.niche)
      : miniAudit.concept_headline || `A faster way for ${job.city} customers to book ${job.niche} services`,
    subhead: miniAudit.concept_subhead || 'Clear CTA, local trust signals, and a simplified path to request service.',
    cta: (preset && preset.default_primary_cta) || (miniAudit.copy_suggestions && miniAudit.copy_suggestions[0]) || 'Get a fast estimate',
    secondary_cta: (preset && preset.default_secondary_cta) || null,
    logo_url: job.brand_logo_url || null,
    concept_image_url: preset && preset.concept_image_url ? preset.concept_image_url : null,
    city: job.city,
    niche: job.niche,
    bullets: preset && preset.default_bullets_json ? preset.default_bullets_json : []
  };
}

/**
 * Select email template variant (1-5) for anti-spam rotation
 * Uses job ID to ensure consistent variant per job
 */
function selectEmailVariant(jobId) {
  // Use job ID to deterministically select variant (1-5)
  // This ensures same job always gets same variant for consistency
  const variant = (jobId % 5) + 1;
  console.log(`[EMAIL] Selected variant ${variant} for job ${jobId}`);
  return variant;
}

function generateEmailHtml(job, miniAudit, screenshots, emailPolish, preset = null, recipientEmail = null) {
  const leaks = miniAudit.top_3_leaks || [];
  const plan = miniAudit.seven_day_plan || [];
  const introLine = emailPolish && emailPolish.intro_line
    ? emailPolish.intro_line
    : `We pulled a quick audit for your ${job.niche} website in ${job.city}.`;

  const ctaText = (preset && preset.default_primary_cta) || (miniAudit.copy_suggestions && miniAudit.copy_suggestions[0]) || 'Unlock full audit';
  
  // Use preset concept image if available, otherwise use screenshot
  // IMPORTANT: Use ABSOLUTE URLs for email clients
  const baseUrl = 'https://maxandjacob.com';
  const imageUrl = preset && preset.concept_image_url 
    ? `${baseUrl}/${preset.concept_image_url}` 
    : (screenshots && screenshots.above_fold ? `${baseUrl}/${screenshots.above_fold}` : '');
  
  const imageLabel = preset && preset.concept_image_url 
    ? 'Concept preview for your industry' 
    : 'Website snapshot';

  // Build unsubscribe URL
  const unsubscribeUrl = recipientEmail 
    ? `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`
    : `${baseUrl}/unsubscribe`;

  // SELECT TEMPLATE VARIANT (1-5) for anti-spam rotation
  const variant = selectEmailVariant(job.id);
  
  // Get company name for personalization
  const companyName = job.company_name || (job.niche ? `your ${job.niche} business` : 'your business');
  const city = job.city || 'your area';
  
  // Generate audit landing page URL
  // CRITICAL: If no public_page_slug exists, we MUST generate one or fail loudly!
  const publicSlug = job.public_page_slug || generatePublicSlug(job);
  const auditUrl = getAuditLandingUrlFromSlug(publicSlug, job.id);
  const auditLabel = companyName ? `Review for ${companyName}` : 'Full Audit Report';

  // GENERATE HTML BASED ON VARIANT (1-5) for anti-spam rotation
  // Using custom personal templates for natural, human-like communication
  let htmlTemplate = '';
  
  // Using unified template for all variants
  const senderEmail = 'jacob@maxandjacob.com';
  
  switch(variant) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      // NEW UNIFIED TEMPLATE: Clear value proposition with homepage preview offer
      htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Free audit</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#111;">
<div style="max-width:600px;margin:40px auto;padding:0 20px;">
<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">Hi ${companyName} — Jacob here (Max & Jacob).</p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">We help local businesses get more calls from their website. I made a free audit for your site (safe preview):</p>
<p style="margin:0 0 20px 0;"><a href="${auditUrl}" style="color:#4F46E5;font-size:16px;text-decoration:underline;">${auditUrl}</a></p>
<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">Next step (optional): we'll design a personalized homepage preview for you in 48 hours (free). Fill the brief and we'll send it over — no calls, no pressure.</p>
<p style="margin:24px 0 0 0;font-size:16px;line-height:1.6;">Jacob Liesner<br>Max & Jacob<br>${senderEmail}</p>
<p style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:12px;color:#999;">
<a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a> · Max & Jacob · 1221 Brickell Ave, Suite 900, Miami, FL 33131 · <a href="https://maxandjacob.com" style="color:#6366f1;text-decoration:none;">maxandjacob.com</a></p>
</div>
</body></html>`;
      break;
      
    default:
      // Fallback to variant 1
      htmlTemplate = `<!DOCTYPE html><html><body><p>Email template error. Please contact support.</p></body></html>`;
  }
  
  return htmlTemplate.trim();
}

function generatePublicPageJson(job, miniAudit, conceptPreview, screenshots, preset = null) {
  return {
    hero: {
      headline: `Website + AI follow-up built to book more ${job.niche} jobs (${job.city})`,
      subhead: 'Built to help you capture more leads, respond instantly, and turn visits into booked calls (not just "quick fixes").'
    },
    concept_preview: conceptPreview,
    current_page_leaks: {
      screenshot: screenshots && screenshots.above_fold ? `/${screenshots.above_fold}` : null,
      callouts: miniAudit.top_3_leaks || []
    },
    leaks: miniAudit.top_3_leaks || [],
    plan: miniAudit.seven_day_plan || [],
    cta_variants: miniAudit.copy_suggestions || [],
    form: {
      fields: ['name', 'email', 'website', 'budget_range', 'decision_maker'],
      cta: (preset && preset.default_primary_cta) || 'Get pricing range + next steps'
    },
    disclaimer: `This is a concept example for ${job.niche} businesses in ${job.city}, not your current website. We'll tailor it after a short intake.`
  };
}

async function processAuditJob(jobId, options = {}) {
  await logStep(jobId, 'process', 'Starting full audit pipeline (Scraper v2)');
  await updateJob(jobId, { status: 'scraping', error_message: null });

  try {
    let job = await loadJob(jobId);
    
    // Load preset if assigned
    let preset = null;
    if (job.preset_id) {
      preset = await new Promise((resolve, reject) => {
        getNichePresetById(job.preset_id, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });

      if (!preset) {
        throw new Error(`Selected preset not found (preset_id=${job.preset_id}). Please reselect/create the preset and try again.`);
      }
      
      // Apply preset niche only (city should ALWAYS be scraped, never from preset)
      const updates = {};
      if (preset && preset.slug) {
        updates.niche = preset.slug;
      }
      // REMOVED: preset.default_city override - city must be detected from scraped data
      
      if (Object.keys(updates).length > 0) {
        await updateJob(jobId, updates);
        job = await loadJob(jobId); // Reload job with updated values
      }
    }
    
    // Validate + normalize website URL (prevents scraper "Invalid URL" crashes).
    if (!job.input_url || job.input_url.trim() === '') {
      throw new Error('Website URL is required');
    }
    try {
      const normalized = normalizeWebsiteUrl(job.input_url);
      if (!normalized) throw new Error('Website URL is required');
      if (normalized !== job.input_url) {
        await updateJob(jobId, { input_url: normalized });
        job.input_url = normalized;
      }
    } catch (e) {
      const message = (e && e.message) ? String(e.message) : 'Invalid website URL';
      throw new Error(message);
    }
    if (!job.niche || job.niche.trim() === '') {
      throw new Error('Niche is required - please select a preset');
    }
    // City will be auto-detected from scraped data (NAP addressLocality or page text)
    // NO FALLBACKS - if detection fails, audit will error
    
    // Scraper v2/v3 conditional logic
    let scrapeResult, rawDump, screenshots, evidencePack;
    
    if (USE_SCRAPER_V3 && scraperV3) {
      // Scraper v3: Multi-page crawler
      await logStep(jobId, 'scrape', 'Using Scraper v3 (multi-page crawler)');
      
      const crawledPages = await scraperV3.crawlWebsite(jobId, job.input_url, logStep);
      
      // Save crawled pages to database
      await logStep(jobId, 'scrape', `Saving ${crawledPages.length} crawled pages to database...`);
      for (const pageData of crawledPages) {
        await new Promise((resolve, reject) => {
          insertCrawledPage({ ...pageData, audit_job_id: jobId }, (err, result) => {
            if (err) return reject(err);
            // Store the page ID for Lighthouse later
            pageData.id = result.id;
            resolve();
          });
        });
      }
      
      // Run Lighthouse audits for top pages
      try {
        const lighthouseResults = await scraperV3.runLighthouseAudits(jobId, crawledPages, logStep);
        
        // Save lighthouse reports to database
        if (lighthouseResults && lighthouseResults.length > 0) {
          await logStep(jobId, 'lighthouse', `Saving ${lighthouseResults.length} Lighthouse reports...`);
          for (const reportData of lighthouseResults) {
            await new Promise((resolve, reject) => {
              insertLighthouseReport(reportData, (err) => {
                if (err) return reject(err);
                resolve();
              });
            });
          }
        }
      } catch (lighthouseErr) {
        await logStep(jobId, 'lighthouse', `Lighthouse failed: ${lighthouseErr.message}`);
      }
      
      // Use homepage data for v2 compatibility
      const homepage = crawledPages.find(p => p.page_type === 'home') || crawledPages[0];
      if (!homepage) {
        throw new Error('No homepage found in crawled pages');
      }
      
      // City MUST come from scraped data (truth) - ignore any prefilled city
      const detectedCity =
        (homepage.nap_json && homepage.nap_json.city)
          ? String(homepage.nap_json.city).trim()
          : (homepage.nap_json && homepage.nap_json.address)
            ? extractCityFromUsAddressString(homepage.nap_json.address)
            : (homepage.cities_json && Array.isArray(homepage.cities_json) && homepage.cities_json.length > 0)
              ? String(homepage.cities_json[0]).trim()
              : null;

      // City detection - use detected or fallback to prefilled, warn if neither
      const prevCity = (job.city || '').toString().trim();
      if (!detectedCity) {
        if (prevCity) {
          await logStep(jobId, 'scrape', `⚠ No city detected from scraped data (v3), using prefilled city: ${prevCity}`);
          job.city = prevCity;
        } else {
          await logStep(jobId, 'scrape', `⚠ No city detected from scraped data (v3), continuing without city`);
          job.city = '';
        }
      } else {
        job.city = detectedCity;
        if (prevCity && prevCity.toLowerCase() !== job.city.toLowerCase()) {
          await logStep(jobId, 'scrape', `⚠ Overriding prefilled city "${prevCity}" with scraped city "${job.city}"`);
        } else {
          await logStep(jobId, 'scrape', `✓ City detected from scraped data: ${job.city}`);
        }
      }
      await updateJob(jobId, { city: job.city });
      
      // Convert v3 data to v2 format for backward compatibility with LLM evaluators
      // IMPORTANT: v3 extracts email into page.nap_json + Evidence Pack v2,
      // but we must ALSO surface it in scrape_result_json.contacts to avoid downstream regressions.
      const contactPageV3 = crawledPages.find(p => p.page_type === 'contact') || null;

      // Collect best-available email from v3 pages (prefer contact page, then homepage, then any page).
      const emailByKey = new Map();
      
      console.log('[AUDIT V3] Email extraction - checking scraped pages...');
      
      // Common placeholder/invalid emails to ignore
      const isInvalidEmail = (email) => {
        const lower = email.toLowerCase();
        const invalidPatterns = [
          'example.com',
          'test.com',
          'test@',
          'noreply@',
          'no-reply@',
          'admin@example',
          'info@example',
          'contact@example',
          'support@example',
          'hello@example',
          'yourname@',
          'youremail@',
          'your.email@',
          'email@domain',
          'user@domain',
          '@localhost',
          '@test',
          'sample@',
          'demo@'
        ];
        return invalidPatterns.some(pattern => lower.includes(pattern));
      };
      
      const pushEmailCandidate = (raw, source) => {
        const s = String(raw || '').trim();
        if (!s) return;
        const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (!m || !m[0]) return;
        const email = m[0].slice(0, 140);
        
        // Skip invalid/placeholder emails
        if (isInvalidEmail(email)) {
          console.log(`[AUDIT V3] Skipping invalid/placeholder email: ${email}`);
          return;
        }
        
        const key = email.toLowerCase();
        if (emailByKey.has(key)) return;
        emailByKey.set(key, { value: email, source: source || 'unknown' });
      };

      if (contactPageV3 && contactPageV3.nap_json && contactPageV3.nap_json.email) {
        pushEmailCandidate(contactPageV3.nap_json.email, 'nap_contact');
      }
      if (homepage && homepage.nap_json && homepage.nap_json.email) {
        pushEmailCandidate(homepage.nap_json.email, 'nap_home');
      }
      (crawledPages || []).forEach((p) => {
        if (p && p.nap_json && p.nap_json.email) {
          pushEmailCandidate(p.nap_json.email, `nap_${p.page_type || 'page'}`);
        }
      });

      // Last-resort fallback: regex scan page text (in case nap_json missed it)
      if (emailByKey.size === 0) {
        const blob = [
          (contactPageV3 && (contactPageV3.content_text || contactPageV3.text_snippet)) || '',
          (homepage && (homepage.content_text || homepage.text_snippet)) || ''
        ].join('\n');
        pushEmailCandidate(blob, 'text_fallback');
      }
      
      // CRITICAL FALLBACK: Try preaudit results ALWAYS (not just when empty)
      // Preaudit has better email detection, so we want it as a high-priority candidate
      if (job.input_url) {
        console.log('[AUDIT V3] Checking preaudit email fallback...');
        const { getPreauditEmailByUrl } = require('../db');
        const preauditEmail = await new Promise((resolve, reject) => {
          getPreauditEmailByUrl(job.input_url, (err, email) => {
            if (err) {
              console.error('[AUDIT V3] Preaudit email fallback error:', err);
              resolve(null);
            } else {
              resolve(email);
            }
          });
        });
        
        if (preauditEmail) {
          console.log('[AUDIT V3] ✓ Found email from preaudit:', preauditEmail);
          // Add as high-priority candidate (will be preferred if scraper found nothing or only bad emails)
          if (emailByKey.size === 0) {
            // No emails found in scrape - preaudit email is our only option
            pushEmailCandidate(preauditEmail, 'preaudit_fallback_primary');
          } else {
            // Emails found in scrape but preaudit might be better - add as alternative
            // Note: We don't override existing emails, but make it available
            const key = preauditEmail.toLowerCase();
            if (!emailByKey.has(key)) {
              emailByKey.set(key, { value: preauditEmail, source: 'preaudit_fallback' });
            }
          }
        } else {
          console.log('[AUDIT V3] No email found in preaudit');
        }
      }

      const emailCandidatesV3 = Array.from(emailByKey.values());
      const bestEmailV3 = emailCandidatesV3.length ? emailCandidatesV3[0].value : null;

      scrapeResult = {
        title: homepage.title,
        meta_description: homepage.meta_description,
        og_site_name: homepage.og_site_name || null,
        h1: homepage.h1_text,
        h2: homepage.h2_json || [],
        ctas: (homepage.ctas_json || []).map(cta => cta.text).slice(0, 6),
        phone: homepage.nap_json ? homepage.nap_json.phone : null,
        email: bestEmailV3, // v3 extracted (nap/text); keep compatible with older fields
        contact_url: contactPageV3 ? contactPageV3.url : null,
        trust_signals: (homepage.trust_signals_json || []).map(s => s.type),
        services_keywords: [], // Can be derived from headings
        performance_summary: 'See Lighthouse reports',
        layout_summary: {
          hero_h1_text: homepage.h1_text || '',
          hero_subheadline: (homepage.h2_json || [])[0] || '',
          has_primary_cta_above_fold: (homepage.ctas_above_fold_json || []).length > 0,
          has_trust_badge_above_fold: (homepage.trust_signals_json || []).length > 0,
          has_phone_in_header: homepage.has_tel_link,
          phone_clickable_tel_link: homepage.has_tel_link,
          contact_page_detected: !!contactPageV3,
          contact_form_detected: homepage.has_form,
          primary_cta_text: (homepage.ctas_above_fold_json || [])[0] ? (homepage.ctas_above_fold_json || [])[0].text : '',
          primary_cta_source: (() => {
            const first = (homepage.ctas_above_fold_json || [])[0] || null;
            const href = first && first.href ? String(first.href).toLowerCase() : '';
            if (href.startsWith('tel:')) return 'tel';
            return first ? 'hero' : null;
          })()
        },
        contacts: {
          phones: homepage.nap_json && homepage.nap_json.phone ? [{ value: homepage.nap_json.phone, source: 'nap' }] : [],
          emails: bestEmailV3 ? [{ value: bestEmailV3, source: (emailCandidatesV3[0] && emailCandidatesV3[0].source) ? emailCandidatesV3[0].source : 'nap' }] : [],
          address: homepage.nap_json ? homepage.nap_json.address : null,
          hours: null,
          social_links: {}
        },
        contacts_debug: {
          emails: {
            sources_checked: ['nap_contact', 'nap_home', 'nap_any', 'text_fallback'],
            candidates_found: emailCandidatesV3.length
          }
        }
      };
      
      // RAW dump v2 (multi-page, high-signal)
      const selectedPages = (crawledPages || []).slice(0, 8).map((p) => {
        const ctas = (p.cta_candidates_json || []).slice(0, 30);
        const internalLinks = ctas.filter(c => c && c.target_type === 'internal' && c.href).slice(0, 20).map(c => ({ text: c.text, href: c.href, intent: c.cta_intent }));
        const telLinks = ctas.filter(c => c && c.target_type === 'tel' && c.href).slice(0, 10).map(c => ({ text: c.text, href: c.href }));
        return {
          page_url: p.url,
          page_type: p.page_type || 'other',
          title: p.title || null,
          meta_description: p.meta_description || null,
          canonical: p.canonical_url || null,
          headings: {
            h1: p.h1_text || null,
            h2: p.h2_json || [],
            h3: p.h3_json || [],
            h6: p.h6_json || []
          },
          word_count: p.word_count || 0,
          text_snippet: p.text_snippet || null,
          links_summary: {
            tel_links: telLinks,
            internal_important_links: internalLinks
          }
        };
      });

      // Aggregated site snapshot (stored for future reuse; not sent to LLM directly)
      const safeHash = (s) => {
        const t = (s || '').toString();
        if (!t) return null;
        return crypto.createHash('sha1').update(t).digest('hex').slice(0, 16);
      };
      const primaryNav = homepage.nav_primary_json || [];
      const footerLinks = homepage.footer_nav_links_json || [];
      const siteSnapshot = {
        version: 'site_snapshot_v1',
        input_url: job.input_url,
        base_origin: (() => { try { return new URL(job.input_url).origin; } catch { return null; } })(),
        created_at: new Date().toISOString(),
        scrape_stats: {
          pages_crawled: (crawledPages || []).length,
          max_pages_target: (process.env.SCRAPER_V3_MAX_URLS || null)
        },
        navigation: {
          primary_tree: primaryNav,
          footer_links: footerLinks
        },
        pages_index: (crawledPages || []).slice(0, 250).map((p) => ({
          url: p.url,
          normalized_url: p.normalized_url || null,
          page_type: p.page_type || null,
          title: p.title || null,
          word_count: p.word_count || 0,
          content_hash: safeHash(p.content_text || p.text_snippet || '')
        }))
      };

      rawDump = {
        version: 'raw_dump_v2',
        site_structure_summary: {
          primary_nav_tree: primaryNav,
          footer_nav_links: footerLinks,
          urls: (crawledPages || []).slice(0, 120).map((p) => ({
            url: p.url,
            page_type: p.page_type || 'other',
            title: p.title || null
          }))
        },
        pages: selectedPages,
        jsonld_raw: homepage.jsonld_blocks_json || [],
        jsonld_extracted: homepage.jsonld_extracted_json || null
      };
      
      screenshots = homepage.screenshots_json || {};
      
      // Generate Evidence Pack v1 (old format for backward compatibility)
      evidencePack = generateEvidencePack(job, scrapeResult, rawDump, screenshots);
      
      // Generate Evidence Pack v2 (NEW - with strict validation rules)
      const evidencePackV2 = generateEvidencePackV2(job, crawledPages, screenshots);
      const warnings = evidencePackV2 ? evidencePackV2.data_quality_warnings : [];
      
      // Download and store logo if found
      let logoInfo = null;
      if (evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo && evidencePackV2.brand_assets.detected_logo.url) {
        await logStep(jobId, 'scrape', `Downloading logo: ${evidencePackV2.brand_assets.detected_logo.url}`);
        logoInfo = await downloadAndStoreLogo(evidencePackV2.brand_assets.detected_logo.url, jobId);
        if (logoInfo && evidencePackV2.brand_assets.detected_logo) {
          evidencePackV2.brand_assets.detected_logo.local_path = logoInfo.public_url;
        }
      }
      
      await logStep(jobId, 'scrape', `Scraper v3 complete: ${crawledPages.length} pages crawled, ${warnings.length} warnings`);
      
      // Store both Evidence Packs, warnings, and logo info
      await updateJob(jobId, {
        evidence_pack_v2_json: JSON.stringify(evidencePackV2),
        warnings_json: JSON.stringify(warnings),
        logo_scraped_url: evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo ? evidencePackV2.brand_assets.detected_logo.url : null,
        logo_scraped_source: evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo ? evidencePackV2.brand_assets.detected_logo.source : null,
        logo_stored_path: logoInfo ? logoInfo.stored_path : null,
        site_snapshot_json: JSON.stringify(siteSnapshot)
      });
    } else {
      // Scraper v2: Extract contacts + raw dump (legacy)
      await logStep(jobId, 'scrape', 'Using Scraper v2 (single page + contacts)');
      const v2Result = await scrapeWebsite(job.input_url, jobId);
      scrapeResult = v2Result.scrapeResult;
      rawDump = v2Result.rawDump;
      screenshots = v2Result.screenshots;
      
      // Generate Evidence Pack v1
      evidencePack = generateEvidencePack(job, scrapeResult, rawDump, screenshots);

      // Minimal Evidence Pack v2 for Scraper v2 path (no crawl): build pseudo pages
      const jsonldBlocks = rawDump.structured_data_jsonld || [];
      const jsonld_extracted_json = (function normalizeJsonLdFromBlocks(blocks) {
        const out = { organization: { name: null, logo: null, sameAs: [], contactPoint: {} }, website: { name: null }, localbusiness: { name: null, image: null, telephone: null, address: null, openingHoursSpecification: null, aggregateRating: null, areaServed: [] }, offer_catalog_services: [] };
        (blocks || []).forEach((b) => {
          const items = Array.isArray(b) ? b : [b];
          items.forEach((it) => {
            const t = it['@type'];
            if (t === 'Organization') {
              if (!out.organization.name && it.name) out.organization.name = it.name;
              if (!out.organization.logo && it.logo) out.organization.logo = (typeof it.logo === 'string') ? it.logo : (it.logo.url || it.logo['@url'] || null);
              if (it.sameAs) out.organization.sameAs = [...new Set(out.organization.sameAs.concat(Array.isArray(it.sameAs) ? it.sameAs : [it.sameAs]))];
              if (it.contactPoint) {
                const cp = Array.isArray(it.contactPoint) ? it.contactPoint[0] : it.contactPoint;
                if (cp && cp.telephone) out.organization.contactPoint.telephone = cp.telephone;
              }
            }
            if (t === 'WebSite') {
              if (!out.website.name && it.name) out.website.name = it.name;
            }
            if (t === 'LocalBusiness' || (typeof t === 'string' && t.includes('LocalBusiness'))) {
              if (!out.localbusiness.name && it.name) out.localbusiness.name = it.name;
              if (!out.localbusiness.image && it.image) out.localbusiness.image = (typeof it.image === 'string') ? it.image : (it.image.url || it.image['@url'] || null);
              if (!out.localbusiness.telephone && it.telephone) out.localbusiness.telephone = it.telephone;
              if (!out.localbusiness.address && it.address && typeof it.address === 'object') {
                out.localbusiness.address = {
                  streetAddress: it.address.streetAddress || null,
                  addressLocality: it.address.addressLocality || null,
                  addressRegion: it.address.addressRegion || null,
                  postalCode: it.address.postalCode || null,
                  addressCountry: it.address.addressCountry || null
                };
              }
              if (!out.localbusiness.openingHoursSpecification && it.openingHoursSpecification) out.localbusiness.openingHoursSpecification = it.openingHoursSpecification;
              if (!out.localbusiness.aggregateRating && it.aggregateRating) out.localbusiness.aggregateRating = it.aggregateRating;
            }
          });
        });
        return out;
      })(jsonldBlocks);

      const pseudoPages = [
        {
          url: job.input_url,
          page_type: 'home',
          title: scrapeResult.title || null,
          og_site_name: scrapeResult.og_site_name || null,
          h1_text: scrapeResult.h1 || null,
          h2_json: scrapeResult.h2 || [],
          h3_json: [],
          h6_json: [],
          text_snippet: (rawDump.homepage_text_snippet || '').slice(0, 4000),
          forms_detailed_json: [],
          cta_candidates_json: [],
          services_extracted_json: {},
          trust_extracted_json: {},
          jsonld_extracted_json
        },
        rawDump.contact_text_snippet
          ? { url: scrapeResult.contact_url || `${job.input_url}/contact`, page_type: 'contact', title: null, og_site_name: scrapeResult.og_site_name || null, h1_text: null, h2_json: [], h3_json: [], h6_json: [], text_snippet: rawDump.contact_text_snippet.slice(0, 4000), forms_detailed_json: [], cta_candidates_json: [], services_extracted_json: {}, trust_extracted_json: {}, jsonld_extracted_json }
          : null
      ].filter(Boolean);

      const evidencePackV2 = generateEvidencePackV2(job, pseudoPages, screenshots);
      const warnings = evidencePackV2 ? evidencePackV2.data_quality_warnings : [];
      
      // City MUST come from scraped data (truth) - ignore any prefilled city
      const v2AddressRaw = (scrapeResult && scrapeResult.contacts && scrapeResult.contacts.address)
        ? scrapeResult.contacts.address
        : null;
      const v2AddressValue = (v2AddressRaw && typeof v2AddressRaw === 'object' && v2AddressRaw.value)
        ? String(v2AddressRaw.value)
        : (typeof v2AddressRaw === 'string' ? v2AddressRaw : null);

      const v2DetectedCity =
        (jsonld_extracted_json && jsonld_extracted_json.localbusiness && jsonld_extracted_json.localbusiness.address && jsonld_extracted_json.localbusiness.address.addressLocality)
          ? String(jsonld_extracted_json.localbusiness.address.addressLocality).trim()
          : v2AddressValue
            ? extractCityFromUsAddressString(v2AddressValue)
            : null;

      // City detection - use detected or fallback to prefilled, warn if neither
      const prevCityV2 = (job.city || '').toString().trim();
      if (!v2DetectedCity) {
        if (prevCityV2) {
          await logStep(jobId, 'scrape', `⚠ No city detected from scraped data (v2), using prefilled city: ${prevCityV2}`);
          job.city = prevCityV2;
        } else {
          await logStep(jobId, 'scrape', `⚠ No city detected from scraped data (v2), continuing without city`);
          job.city = '';
        }
      } else {
        job.city = v2DetectedCity;
        if (prevCityV2 && prevCityV2.toLowerCase() !== job.city.toLowerCase()) {
          await logStep(jobId, 'scrape', `⚠ Overriding prefilled city "${prevCityV2}" with scraped city "${job.city}"`);
        } else {
          await logStep(jobId, 'scrape', `✓ City detected from scraped data: ${job.city}`);
        }
      }
      await updateJob(jobId, { city: job.city });
      
      await updateJob(jobId, {
        evidence_pack_v2_json: JSON.stringify(evidencePackV2),
        warnings_json: JSON.stringify(warnings)
      });
      
      await logStep(jobId, 'scrape', 'Scrape completed (v2: contacts + evidence pack)');
    }
    
    // Normalize screenshot keys (v3 vs v2) so downstream/UI uses consistent refs
    screenshots = normalizeScreenshotsForJob(screenshots);

    await updateJob(jobId, {
      scrape_result_json: JSON.stringify(scrapeResult),
      raw_dump_json: JSON.stringify(rawDump),
      evidence_pack_json: JSON.stringify(evidencePack),
      screenshots_json: JSON.stringify(screenshots),
      status: 'evaluating'
    });

    // Choose between Template Engine (fast, deterministic) or LLM Assistants (legacy)
    const useTemplateEngine = options.useTemplates !== false; // Default: true (use templates)
    
    if (useTemplateEngine) {
      // NEW: Template-based audit generation (fast, no LLM cost)
      await runTemplateAuditPipeline(jobId, options);
      
      // Template engine generates everything - just build mini_audit for backwards compat and we're done
      job = await loadJob(jobId);
      const assistant_outputs = job.assistant_outputs_json || {};
      const miniAudit = {
        top_3_leaks: assistant_outputs.ux_audit_json?.top_issues || [],
        seven_day_plan: assistant_outputs.ux_audit_json?.quick_wins || [],
        copy_suggestions: assistant_outputs.offer_copy_json?.offer_package?.deliverables?.map(d => d.item) || [],
        concept_headline: assistant_outputs.offer_copy_json?.offer_package?.headline || '',
        concept_subhead: assistant_outputs.offer_copy_json?.offer_package?.value_prop || '',
        tone: 'evidence-based',
        assistant_results: assistant_outputs
      };
      
      await updateJob(jobId, {
        mini_audit_json: JSON.stringify(miniAudit),
        llm_config_snapshot: JSON.stringify({
          pipeline_version: 'template_engine_v1',
          settings: options.settings || {},
          timestamp: new Date().toISOString()
        }),
        status: 'ready'
      });
      
      await logStep(jobId, 'outputs', 'Template audit generation completed');
      return; // EXIT EARLY - template engine already generated email & public page
    }
    
    // LEGACY PATH: LLM Assistants v1 pipeline
    await runAssistantsPipeline(jobId, options);
    
    // Reload job to get assistant outputs
    job = await loadJob(jobId);
    
    // Build mini_audit_json for backward compatibility with old email/public page generators
    const assistant_outputs = job.assistant_outputs_json || {};
    const miniAudit = {
      // Map UX audit outputs
      top_3_leaks: assistant_outputs.ux_audit_json?.top_issues || [],
      seven_day_plan: assistant_outputs.ux_audit_json?.quick_wins || [],
      // Map offer outputs
      copy_suggestions: assistant_outputs.offer_copy_json?.offer_package?.deliverables?.map(d => d.item) || [],
      concept_headline: assistant_outputs.offer_copy_json?.offer_package?.headline || '',
      concept_subhead: assistant_outputs.offer_copy_json?.offer_package?.value_prop || '',
      tone: 'evidence-based',
      // Include all outputs for reference
      assistant_results: assistant_outputs
    };
    
    await updateJob(jobId, {
      mini_audit_json: JSON.stringify(miniAudit),
      llm_config_snapshot: JSON.stringify({
        pipeline_version: 'assistants_v1',
        settings: options.settings || {},
        timestamp: new Date().toISOString()
      })
    });
    
    await logStep(jobId, 'llm', 'LLM Assistants v1 pipeline completed');

    // Generate email and public page from assistant outputs
    const emailPackJson = assistant_outputs.email_pack_json;
    const publicPageJsonFromAssistant = assistant_outputs.public_page_json;

    // Compute public slug early so we can build a stable audit URL for email formatting.
    const publicSlug = job.public_page_slug || generatePublicSlug(job);
    const auditUrl = getAuditLandingUrlFromSlug(publicSlug, jobId);
    const companyLabel =
      (job.company_name && String(job.company_name).trim()) ||
      (assistant_outputs.llm_context_json && assistant_outputs.llm_context_json.company_profile && assistant_outputs.llm_context_json.company_profile.name) ||
      '';
    
    // Use email from A5 if available, otherwise fall back to old generator
    let emailHtml;
    if (emailPackJson && emailPackJson.email_body_html) {
      emailHtml = ensureAuditLinkBlockInEmailHtml(emailPackJson.email_body_html, { publicSlug, auditUrl, companyLabel });
    } else {
      const emailPolish = await runEmailPolish(job, miniAudit, options);
      emailHtml = ensureAuditLinkBlockInEmailHtml(
        generateEmailHtml(job, miniAudit, screenshots, emailPolish, preset),
        { publicSlug, auditUrl, companyLabel }
      );
    }
    
    // Use public page from A6 if available
    let publicPageJson;
    if (publicPageJsonFromAssistant) {
      publicPageJson = publicPageJsonFromAssistant;
    } else {
      const conceptPreview = await generateConceptPreview(job, miniAudit, preset);
      publicPageJson = generatePublicPageJson(job, miniAudit, conceptPreview, screenshots, preset);
    }

    await updateJob(jobId, {
      email_html: emailHtml,
      public_page_json: JSON.stringify(publicPageJson),
      public_page_slug: publicSlug,
      status: 'ready'
    });
    await logStep(jobId, 'outputs', 'Outputs generated');
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error_message: err.message });
    await logStep(jobId, 'error', err.message);
    throw err;
  }
}

async function runLlmOnly(jobId, options = {}) {
  await logStep(jobId, 'llm', 'Starting LLM-only run (v2)');
  await updateJob(jobId, { status: 'evaluating', error_message: null });

  try {
    const job = await loadJob(jobId);
    const scrapeResult = job.scrape_result_json || {};
    const screenshots = job.screenshots_json || {};
    const rawDump = job.raw_dump_json || {};
    const evidencePack = job.evidence_pack_json || null;

    const { miniAudit, llmSnapshot } = await runLlmEvaluators(job, scrapeResult, screenshots, rawDump, evidencePack, options);
    await updateJob(jobId, {
      mini_audit_json: JSON.stringify(miniAudit),
      llm_config_snapshot: JSON.stringify(llmSnapshot),
      status: 'ready'
    });
    await logStep(jobId, 'llm', 'LLM-only run completed');
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error_message: err.message });
    await logStep(jobId, 'error', err.message);
    throw err;
  }
}

async function regenerateEmail(jobId, options = {}) {
  await logStep(jobId, 'email', 'Regenerating email');
  try {
    const job = await loadJob(jobId);
    
    // Load preset if assigned
    let preset = null;
    if (job.preset_id) {
      preset = await new Promise((resolve, reject) => {
        getNichePresetById(job.preset_id, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
    }
    
    const miniAudit = job.mini_audit_json || {};
    const screenshots = job.screenshots_json || {};
    const emailPolish = await runEmailPolish(job, miniAudit, options);
    const publicSlug = job.public_page_slug || generatePublicSlug(job);
    const auditUrl = getAuditLandingUrlFromSlug(publicSlug, jobId);
    const companyLabel =
      (job.company_name && String(job.company_name).trim()) ||
      (job.llm_context_json && job.llm_context_json.company_profile && job.llm_context_json.company_profile.name) ||
      '';
    const emailHtml = ensureAuditLinkBlockInEmailHtml(
      generateEmailHtml(job, miniAudit, screenshots, emailPolish, preset),
      { publicSlug, auditUrl, companyLabel }
    );
    await updateJob(jobId, { email_html: emailHtml, status: 'ready' });
    await logStep(jobId, 'email', 'Email regenerated');
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error_message: err.message });
    await logStep(jobId, 'error', err.message);
    throw err;
  }
}

async function regeneratePublicPage(jobId) {
  await logStep(jobId, 'public', 'Regenerating public page');
  try {
    const job = await loadJob(jobId);
    
    // Load preset if assigned
    let preset = null;
    if (job.preset_id) {
      preset = await new Promise((resolve, reject) => {
        getNichePresetById(job.preset_id, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
    }
    
    const miniAudit = job.mini_audit_json || {};
    const screenshots = job.screenshots_json || {};
    const conceptPreview = await generateConceptPreview(job, miniAudit, preset);
    const publicPageJson = generatePublicPageJson(job, miniAudit, conceptPreview, screenshots, preset);
    await updateJob(jobId, { public_page_json: JSON.stringify(publicPageJson), status: 'ready' });
    await logStep(jobId, 'public', 'Public page regenerated');
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error_message: err.message });
    await logStep(jobId, 'error', err.message);
    throw err;
  }
}

async function regenerateEvidencePackV2(jobId) {
  await logStep(jobId, 'evidence_pack_v2', 'Regenerating Evidence Pack v2');
  try {
    const job = await loadJob(jobId);
    
    // Load crawled pages from database
    const crawledPages = await new Promise((resolve, reject) => {
      const db = require('../db').db;
      db.all('SELECT * FROM crawled_pages WHERE audit_job_id = ? ORDER BY priority_score DESC', [jobId], (err, rows) => {
        if (err) return reject(err);
        // Parse JSON fields
        const parsed = rows.map(row => ({
          ...row,
          h2_json: row.h2_json ? JSON.parse(row.h2_json) : [],
          h3_json: row.h3_json ? JSON.parse(row.h3_json) : [],
          cta_candidates_json: row.cta_candidates_json ? JSON.parse(row.cta_candidates_json) : [],
          forms_detailed_json: row.forms_detailed_json ? JSON.parse(row.forms_detailed_json) : [],
          jsonld_extracted_json: row.jsonld_extracted_json ? JSON.parse(row.jsonld_extracted_json) : null,
          brand_assets_json: row.brand_assets_json ? JSON.parse(row.brand_assets_json) : null,
          trust_signals_json: row.trust_signals_json ? JSON.parse(row.trust_signals_json) : [],
          nap_json: row.nap_json ? JSON.parse(row.nap_json) : null
        }));
        resolve(parsed);
      });
    });
    
    if (crawledPages.length === 0) {
      throw new Error('No crawled pages found - cannot regenerate Evidence Pack v2');
    }
    
    const screenshots = job.screenshots_json || {};
    
    // Generate Evidence Pack v2
    const evidencePackV2 = generateEvidencePackV2(job, crawledPages, screenshots);
    const warnings = evidencePackV2 ? evidencePackV2.data_quality_warnings : [];
    
    // Download logo if not already downloaded
    let logoInfo = null;
    if (evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo && evidencePackV2.brand_assets.detected_logo.url && !job.logo_stored_path) {
      await logStep(jobId, 'evidence_pack_v2', `Downloading logo: ${evidencePackV2.brand_assets.detected_logo.url}`);
      logoInfo = await downloadAndStoreLogo(evidencePackV2.brand_assets.detected_logo.url, jobId);
      if (logoInfo && evidencePackV2.brand_assets.detected_logo) {
        evidencePackV2.brand_assets.detected_logo.local_path = logoInfo.public_url;
      }
    }
    
    // Update Evidence Pack v2 and warnings
    await updateJob(jobId, {
      evidence_pack_v2_json: JSON.stringify(evidencePackV2),
      warnings_json: JSON.stringify(warnings),
      logo_scraped_url: evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo ? evidencePackV2.brand_assets.detected_logo.url : job.logo_scraped_url,
      logo_scraped_source: evidencePackV2 && evidencePackV2.brand_assets && evidencePackV2.brand_assets.detected_logo ? evidencePackV2.brand_assets.detected_logo.source : job.logo_scraped_source,
      logo_stored_path: logoInfo ? logoInfo.stored_path : job.logo_stored_path,
      status: 'ready'
    });
    
    await logStep(jobId, 'evidence_pack_v2', `Evidence Pack v2 regenerated with ${warnings.length} warnings`);
    
    return { success: true, warnings_count: warnings.length };
  } catch (err) {
    await logStep(jobId, 'error', err.message);
    throw err;
  }
}

// ==================== LLM ASSISTANTS V1 PIPELINE ====================

const { sendOpenRouterRequest, retryOnTransientError } = require('./openRouterClient');
const { validateAssistantOutput } = require('./outputValidator');
const { buildPayload, checkAssistantDependencies } = require('./payloadBuilders');
const { trackPayload, trackResponse, generateJobReport } = require('./tokenAnalytics');
const { 
  insertAssistantRun, 
  updateAssistantRun,
  getAssistantRunsByJobId
} = require('../db');

function normalizeScreenshotsForJob(screenshots = {}) {
  const s = (screenshots && typeof screenshots === 'object') ? screenshots : {};
  const out = { ...s };

  // Scraper v3 keys -> legacy keys used across UI/pipeline
  if (!out.above_fold && out.desktop_above_fold) out.above_fold = out.desktop_above_fold;
  if (!out.fullpage && out.desktop_full) out.fullpage = out.desktop_full;

  // Scraper v2 "mobile" -> assistants expect mobile_above_fold
  if (!out.mobile_above_fold && out.mobile) out.mobile_above_fold = out.mobile;

  return out;
}

function coerceEvidenceNormalizerOutput(output_json, job) {
  const base =
    output_json && typeof output_json === 'object' && !Array.isArray(output_json)
      ? { ...output_json }
      : {};

  let changed = false;

  const ensureWarningsArray = () => {
    if (!Array.isArray(base.quality_warnings)) {
      base.quality_warnings = [];
      changed = true;
    }
  };

  const addCoerceWarning = (message) => {
    ensureWarningsArray();
    base.quality_warnings.unshift({
      code: 'WARN_LLM_OUTPUT_COERCED',
      severity: 'low',
      message: String(message).slice(0, 300)
    });
  };

  // company_profile
  if (!base.company_profile || typeof base.company_profile !== 'object' || Array.isArray(base.company_profile)) {
    base.company_profile = {};
    changed = true;
  }
  if (!('name' in base.company_profile)) {
    base.company_profile.name = job.company_name || job.company || job.input_url || null;
    changed = true;
  }
  if (!Array.isArray(base.company_profile.phones)) {
    base.company_profile.phones = [];
    changed = true;
  }
  if (!Array.isArray(base.company_profile.emails)) {
    base.company_profile.emails = [];
    changed = true;
  }
  if (!('address' in base.company_profile)) {
    base.company_profile.address = null;
    changed = true;
  }
  if (!('hours' in base.company_profile)) {
    base.company_profile.hours = null;
    changed = true;
  }
  if (!Array.isArray(base.company_profile.social_links)) {
    base.company_profile.social_links = [];
    changed = true;
  }

  // services
  if (!base.services || typeof base.services !== 'object' || Array.isArray(base.services)) {
    base.services = {};
    changed = true;
  }
  if (!Array.isArray(base.services.featured)) {
    base.services.featured = [];
    changed = true;
  }
  if (!Array.isArray(base.services.other_keywords)) {
    base.services.other_keywords = [];
    changed = true;
  }

  // cta_analysis
  if (!base.cta_analysis || typeof base.cta_analysis !== 'object' || Array.isArray(base.cta_analysis)) {
    base.cta_analysis = {};
    changed = true;
  }
  if (!('primary' in base.cta_analysis)) {
    base.cta_analysis.primary = null;
    changed = true;
  }
  if (!Array.isArray(base.cta_analysis.all_ctas)) {
    base.cta_analysis.all_ctas = [];
    changed = true;
  }

  // other required top-level keys
  if (!Array.isArray(base.trust_evidence)) {
    base.trust_evidence = [];
    changed = true;
  }
  if (!base.contact_friction || typeof base.contact_friction !== 'object' || Array.isArray(base.contact_friction)) {
    base.contact_friction = {};
    changed = true;
  }
  if (!('phone_in_header' in base.contact_friction)) {
    base.contact_friction.phone_in_header = false;
    changed = true;
  }
  if (!('phone_clickable' in base.contact_friction)) {
    base.contact_friction.phone_clickable = false;
    changed = true;
  }
  if (!('clicks_to_contact' in base.contact_friction)) {
    base.contact_friction.clicks_to_contact = null;
    changed = true;
  }
  if (!('form_detected' in base.contact_friction)) {
    base.contact_friction.form_detected = false;
    changed = true;
  }

  ensureWarningsArray();

  // Best-effort normalize quality_warnings entries into objects
  base.quality_warnings = (base.quality_warnings || [])
    .map((w) => {
      if (!w) return null;
      if (typeof w === 'string') {
        return { code: 'WARN_NOTE', severity: 'low', message: w.slice(0, 200) };
      }
      if (typeof w === 'object' && !Array.isArray(w)) {
        return {
          code: w.code || 'WARN_NOTE',
          severity: w.severity || 'low',
          message: (w.message || '').toString().slice(0, 300)
        };
      }
      return null;
    })
    .filter(Boolean);

  if (changed) {
    addCoerceWarning('Auto-filled missing required keys in Evidence Normalizer output (LLM returned incomplete JSON).');
  }

  return base;
}

// ==================== LLM OUTPUT NORMALIZATION (ANTI-DUPLICATION) ====================

function canonicalizeForDedup(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/\bphone\s+number\b/g, 'phone')
    .replace(/\btelephone\b/g, 'phone')
    .replace(/\bcall[- ]?to[- ]?action\b/g, 'cta')
    .replace(/\babove[- ]the[- ]fold\b/g, 'above fold')
    .replace(/\bclick[- ]to[- ]call\b/g, 'click to call')
    .replace(/\b\d+\b/g, '0')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSetForDedup(input) {
  const s = canonicalizeForDedup(input);
  if (!s) return [];
  return Array.from(new Set(s.split(' ').filter(Boolean)));
}

function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normalizeStringArray(arr, { max = null, similarityThreshold = 0.97 } = {}) {
  const out = [];
  const seen = new Set();
  const tokenSets = [];
  for (const raw of (Array.isArray(arr) ? arr : [])) {
    if (raw == null) continue;
    const s = String(raw).trim();
    if (!s) continue;

    const key = canonicalizeForDedup(s);
    if (!key) continue;
    if (seen.has(key)) continue;

    const tokens = tokenSetForDedup(s);
    let tooSimilar = false;
    for (const prev of tokenSets) {
      if (jaccardSimilarity(tokens, prev) >= similarityThreshold) {
        tooSimilar = true;
        break;
      }
    }
    if (tooSimilar) continue;

    seen.add(key);
    tokenSets.push(tokens);
    out.push(s);
    if (max != null && out.length >= max) break;
  }
  return out;
}

function dedupeObjectsByText(items, getText, { max = null, similarityThreshold = 0.92 } = {}) {
  const out = [];
  const seen = new Set();
  const tokenSets = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const text = getText(it);
    const key = canonicalizeForDedup(text);
    if (!key) continue;
    if (seen.has(key)) continue;

    const tokens = tokenSetForDedup(text);
    let tooSimilar = false;
    for (const prev of tokenSets) {
      if (jaccardSimilarity(tokens, prev) >= similarityThreshold) {
        tooSimilar = true;
        break;
      }
    }
    if (tooSimilar) continue;

    seen.add(key);
    tokenSets.push(tokens);
    out.push(it);
    if (max != null && out.length >= max) break;
  }
  return out;
}

function normalizeUxAuditOutput(output_json) {
  const base =
    output_json && typeof output_json === 'object' && !Array.isArray(output_json)
      ? { ...output_json }
      : {};

  const topIssuesRaw = Array.isArray(base.top_issues) ? base.top_issues : [];
  const top_issues = dedupeObjectsByText(
    topIssuesRaw,
    (it) => it.problem || it.title || it.issue || '',
    { max: 5, similarityThreshold: 0.92 }
  ).map((it) => {
    const fix_steps = normalizeStringArray(
      Array.isArray(it.fix_steps) ? it.fix_steps : (typeof it.fix === 'string' ? [it.fix] : []),
      { max: 6, similarityThreshold: 0.97 }
    );
    const evidence_ref = normalizeStringArray(Array.isArray(it.evidence_ref) ? it.evidence_ref : [], { max: 12, similarityThreshold: 0.99 });
    const problem = (typeof it.problem === 'string') ? it.problem.trim() : it.problem;
    const why_it_matters = (typeof it.why_it_matters === 'string') ? it.why_it_matters.trim() : it.why_it_matters;
    const severity = (typeof it.severity === 'string') ? it.severity.trim().toLowerCase() : it.severity;
    return { ...it, problem, why_it_matters, severity, fix_steps, evidence_ref };
  });

  const quickWinsRaw = Array.isArray(base.quick_wins) ? base.quick_wins : [];
  const quick_wins = normalizeStringArray(
    quickWinsRaw
      .map((w) => {
        if (typeof w === 'string') return w;
        if (w && typeof w === 'object' && !Array.isArray(w)) return w.title || w.action || w.fix || w.problem || null;
        return null;
      })
      .filter(Boolean),
    { max: 3, similarityThreshold: 0.96 }
  );

  const mobileIssuesRaw = Array.isArray(base.mobile_issues) ? base.mobile_issues : [];
  const mobile_issues = dedupeObjectsByText(
    mobileIssuesRaw,
    (it) => it.problem || it.title || it.issue || '',
    { max: 3, similarityThreshold: 0.92 }
  ).map((it) => {
    const evidence_ref = normalizeStringArray(Array.isArray(it.evidence_ref) ? it.evidence_ref : [], { max: 10, similarityThreshold: 0.99 });
    const problem = (typeof it.problem === 'string') ? it.problem.trim() : it.problem;
    const fix = (typeof it.fix === 'string') ? it.fix.trim() : it.fix;
    return { ...it, problem, fix, evidence_ref };
  });

  base.top_issues = top_issues;
  base.quick_wins = quick_wins;
  base.mobile_issues = mobile_issues;
  return base;
}

function normalizeLocalSeoAuditOutput(output_json) {
  const base =
    output_json && typeof output_json === 'object' && !Array.isArray(output_json)
      ? { ...output_json }
      : {};

  if (!base.nap_audit || typeof base.nap_audit !== 'object' || Array.isArray(base.nap_audit)) {
    base.nap_audit = { status: 'missing', issues: [] };
  }
  const napIssuesRaw = Array.isArray(base.nap_audit.issues) ? base.nap_audit.issues : [];
  const issues = dedupeObjectsByText(
    napIssuesRaw,
    (it) => it.problem || it.title || '',
    { max: 12, similarityThreshold: 0.92 }
  ).map((it) => {
    const evidence_ref = normalizeStringArray(Array.isArray(it.evidence_ref) ? it.evidence_ref : [], { max: 12, similarityThreshold: 0.99 });
    const problem = (typeof it.problem === 'string') ? it.problem.trim() : it.problem;
    const fix = (typeof it.fix === 'string') ? it.fix.trim() : it.fix;
    const impact = (typeof it.impact === 'string') ? it.impact.trim() : it.impact;
    return { ...it, problem, fix, impact, evidence_ref };
  });
  base.nap_audit = { ...base.nap_audit, issues };

  if (base.schema_markup && base.schema_markup.local_business && Array.isArray(base.schema_markup.local_business.missing_fields)) {
    base.schema_markup = { ...base.schema_markup };
    base.schema_markup.local_business = { ...base.schema_markup.local_business };
    base.schema_markup.local_business.missing_fields = normalizeStringArray(
      base.schema_markup.local_business.missing_fields,
      { max: 20, similarityThreshold: 0.99 }
    );
  }

  if (base.geo_ready_score && typeof base.geo_ready_score === 'object' && !Array.isArray(base.geo_ready_score)) {
    const factorsRaw = Array.isArray(base.geo_ready_score.factors) ? base.geo_ready_score.factors : [];
    const factors = dedupeObjectsByText(
      factorsRaw,
      (f) => f.factor || '',
      { max: 30, similarityThreshold: 0.98 }
    ).map((f) => {
      const evidence_ref = normalizeStringArray(Array.isArray(f.evidence_ref) ? f.evidence_ref : [], { max: 10, similarityThreshold: 0.99 });
      const factor = (typeof f.factor === 'string') ? f.factor.trim() : f.factor;
      return { ...f, factor, evidence_ref };
    });
    base.geo_ready_score = { ...base.geo_ready_score, factors };
  }

  return base;
}

function normalizePublicPageOutput(output_json) {
  const base =
    output_json && typeof output_json === 'object' && !Array.isArray(output_json)
      ? { ...output_json }
      : {};

  if (!base.findings_section || typeof base.findings_section !== 'object' || Array.isArray(base.findings_section)) {
    base.findings_section = { findings: [] };
  }
  const findingsRaw = Array.isArray(base.findings_section.findings) ? base.findings_section.findings : [];
  const findings = dedupeObjectsByText(
    findingsRaw,
    (f) => f.title || f.problem || f.issue || '',
    { max: 3, similarityThreshold: 0.92 }
  ).map((f) => {
    const title = (typeof f.title === 'string') ? f.title.trim() : f.title;
    const description = (typeof f.description === 'string') ? f.description.trim() : f.description;
    const evidence_ref = normalizeStringArray(Array.isArray(f.evidence_ref) ? f.evidence_ref : [], { max: 12, similarityThreshold: 0.99 });
    return { ...f, title, description, evidence_ref };
  });
  base.findings_section = { ...base.findings_section, findings };

  if (base.concept_preview && typeof base.concept_preview === 'object' && !Array.isArray(base.concept_preview) && Array.isArray(base.concept_preview.improvements)) {
    base.concept_preview = { ...base.concept_preview };
    base.concept_preview.improvements = normalizeStringArray(base.concept_preview.improvements, { max: 8, similarityThreshold: 0.96 });
  }

  if (Array.isArray(base.compliance_disclaimers)) {
    base.compliance_disclaimers = normalizeStringArray(base.compliance_disclaimers, { max: 12, similarityThreshold: 0.98 });
  }

  return base;
}

function normalizeAssistantOutput(assistant_key, output_json) {
  try {
    switch (assistant_key) {
      case 'ux_conversion_auditor':
        return normalizeUxAuditOutput(output_json);
      case 'local_seo_geo_auditor':
        return normalizeLocalSeoAuditOutput(output_json);
      case 'public_audit_page_composer':
        return normalizePublicPageOutput(output_json);
      default:
        return output_json;
    }
  } catch (_) {
    return output_json;
  }
}

/**
 * Run a single assistant with full validation and error handling
 * 
 * @param {number} jobId - Audit job ID
 * @param {string} assistant_key - Assistant key (e.g., 'evidence_normalizer')
 * @param {Object} payload_data - Data for building payload (dependencies)
 * @param {Object} options - Options (model/temp overrides, etc.)
 * @returns {Promise<Object>} - {status: 'ok'|'failed', output: Object, error: string}
 */
async function runSingleAssistant(jobId, assistant_key, payload_data = {}, options = {}) {
  await logStep(jobId, `assistant_${assistant_key}`, `Starting ${assistant_key}...`);
  
  // 1. Get assistant config from DB
  const assistant = await new Promise((resolve, reject) => {
    const { getAssistantByKey } = require('../db');
    getAssistantByKey(assistant_key, (err, data) => {
      if (err) return reject(err);
      if (!data) return reject(new Error(`Assistant not found: ${assistant_key}`));
      resolve(data);
    });
  });

  // Apply overrides from options if provided
  const model = options[`${assistant_key}_model`] || assistant.model;
  const temperature = Number.isFinite(options[`${assistant_key}_temperature`]) 
    ? options[`${assistant_key}_temperature`] 
    : assistant.temperature;
  const prompt = options[`${assistant_key}_prompt`] || assistant.prompt;

  // 2. Build payload using payloadBuilders
  let user_content;
  try {
    user_content = buildPayload(assistant_key, payload_data);
  } catch (buildError) {
    await logStep(jobId, `assistant_${assistant_key}`, `Payload build failed: ${buildError.message}`);
    return {
      status: 'failed',
      error: `Failed to build payload: ${buildError.message}`,
      output: null
    };
  }

  // 3. Create assistant_run record (status='running')
  const runId = await new Promise((resolve, reject) => {
    insertAssistantRun({
      job_id: jobId,
      assistant_key,
      model,
      temperature,
      prompt_template_id: null, // TODO: Link to prompt_templates if needed
      status: 'running',
      started_at: new Date().toISOString()
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result.id);
    });
  });

  // 4. Call OpenRouter with retry logic
  try {
    // Track payload before sending (token analytics)
    trackPayload(jobId, assistant_key, user_content, { model, temperature });

    const response = await retryOnTransientError(async () => {
      return await sendOpenRouterRequest({
        model,
        temperature,
        system_prompt: prompt,
        user_content,
        metadata: {
          job_id: jobId,
          assistant_key,
          run_id: runId
        }
      });
    }, 1, 2000); // Max 1 retry, 2s delay

    await logStep(jobId, `assistant_${assistant_key}`, `LLM response received (${response.token_usage?.total_tokens || 'unknown'} tokens)`);

    // Track actual token usage (token analytics)
    trackResponse(jobId, assistant_key, response.token_usage);

    // 5. Validate output
    let parsed = response.parsed_json;
    let validation = validateAssistantOutput(assistant, parsed);

    // Evidence Normalizer (A1) is a hard dependency for the whole pipeline.
    // If the model returns an incomplete JSON object, auto-fill a safe skeleton
    // (empty arrays/objects) and retry validation so the pipeline can proceed
    // with explicit quality_warnings instead of hard-failing on missing keys.
    if (!validation.valid && assistant_key === 'evidence_normalizer') {
      parsed = coerceEvidenceNormalizerOutput(parsed, payload_data.job || {});
      validation = validateAssistantOutput(assistant, parsed);
    }

    if (!validation.valid) {
      // Mark as failed
      await new Promise((resolve, reject) => {
        updateAssistantRun(runId, {
          status: 'failed',
          error: validation.errors.join('; '),
          request_payload_json: response.request_payload,
          response_text: response.raw_text,
          response_json: parsed, // Save even if invalid for debugging (may be coerced)
          token_usage_json: response.token_usage,
          finished_at: new Date().toISOString()
        }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      await logStep(jobId, `assistant_${assistant_key}`, `Validation failed: ${validation.errors.join('; ')}`);

      // Optional: one repair attempt for non-A1 assistants.
      // We record the failed run above, then create a second run that retries with
      // explicit validation errors appended to the system prompt.
      const repairEnabled =
        assistant_key !== 'evidence_normalizer' &&
        !(options && options.disable_validation_repair === true);

      if (repairEnabled) {
        const repairModel = (options && options.validation_repair_model) || 'openai/gpt-4.1-mini';
        const repairTemperature = 0.0;
        const repairPrompt =
          `${prompt}\n\n` +
          `IMPORTANT: Your previous response failed validation. Fix ONLY the errors below and return corrected JSON only.\n` +
          `Validation errors:\n- ${validation.errors.join('\n- ')}\n\n` +
          `Rules:\n` +
          `- Do NOT add new facts or new findings.\n` +
          `- Keep the same items; only fix JSON structure, missing keys/types, evidence_ref formatting/prefixes, and remove prohibited phrasing if present.\n` +
          `- Return STRICT JSON only (double quotes, no trailing commas, no markdown).\n`;

        await logStep(jobId, `assistant_${assistant_key}`, `Attempting auto-repair with ${repairModel}...`);

        const repairRunId = await new Promise((resolve, reject) => {
          insertAssistantRun({
            job_id: jobId,
            assistant_key,
            model: repairModel,
            temperature: repairTemperature,
            prompt_template_id: null,
            status: 'running',
            started_at: new Date().toISOString()
          }, (err, result) => {
            if (err) return reject(err);
            resolve(result.id);
          });
        });

        try {
          const repairResponse = await retryOnTransientError(async () => {
            return await sendOpenRouterRequest({
              model: repairModel,
              temperature: repairTemperature,
              system_prompt: repairPrompt,
              user_content,
              metadata: {
                job_id: jobId,
                assistant_key,
                run_id: repairRunId,
                repair_of_run_id: runId
              }
            });
          }, 1, 2000);

          const repaired = repairResponse.parsed_json;
          const repairValidation = validateAssistantOutput(assistant, repaired);

          if (repairValidation.valid) {
            const normalizedRepaired = normalizeAssistantOutput(assistant_key, repaired);
            await new Promise((resolve, reject) => {
              updateAssistantRun(repairRunId, {
                status: 'ok',
                request_payload_json: repairResponse.request_payload,
                response_text: repairResponse.raw_text,
                response_json: normalizedRepaired,
                token_usage_json: repairResponse.token_usage,
                finished_at: new Date().toISOString()
              }, (err) => {
                if (err) return reject(err);
                resolve();
              });
            });

            await logStep(jobId, `assistant_${assistant_key}`, `Auto-repair succeeded (run ${repairRunId})`);

            return {
              status: 'ok',
              output: normalizedRepaired,
              error: null
            };
          }

          await new Promise((resolve, reject) => {
            updateAssistantRun(repairRunId, {
              status: 'failed',
              error: repairValidation.errors.join('; '),
              request_payload_json: repairResponse.request_payload,
              response_text: repairResponse.raw_text,
              response_json: repaired,
              token_usage_json: repairResponse.token_usage,
              finished_at: new Date().toISOString()
            }, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });

          await logStep(jobId, `assistant_${assistant_key}`, `Auto-repair failed: ${repairValidation.errors.join('; ')}`);
        } catch (repairErr) {
          await new Promise((resolve) => {
            updateAssistantRun(repairRunId, {
              status: 'failed',
              error: repairErr.message,
              finished_at: new Date().toISOString()
            }, () => resolve());
          });
          await logStep(jobId, `assistant_${assistant_key}`, `Auto-repair request failed: ${repairErr.message}`);
        }
      }

      return {
        status: 'failed',
        error: validation.errors.join('; '),
        output: parsed // Return output anyway for debugging (may be coerced)
      };
    }

    // 6. Normalize output (anti-dup / stability), then save successful run
    parsed = normalizeAssistantOutput(assistant_key, parsed);

    await new Promise((resolve, reject) => {
      updateAssistantRun(runId, {
        status: 'ok',
        request_payload_json: response.request_payload,
        response_text: response.raw_text,
        response_json: parsed,
        token_usage_json: response.token_usage,
        finished_at: new Date().toISOString()
      }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    await logStep(jobId, `assistant_${assistant_key}`, `Completed successfully`);

    return {
      status: 'ok',
      output: parsed,
      error: null
    };

  } catch (error) {
    // Mark run as failed
    await new Promise((resolve, reject) => {
      updateAssistantRun(runId, {
        status: 'failed',
        error: error.message,
        finished_at: new Date().toISOString()
      }, (err) => {
        if (err) console.error('Failed to update assistant run:', err);
        resolve(); // Don't fail the whole thing if DB update fails
      });
    });

    await logStep(jobId, `assistant_${assistant_key}`, `Failed: ${error.message}`);

    return {
      status: 'failed',
      error: error.message,
      output: null
    };
  }
}

/**
 * Run Template-based Audit Pipeline (replaces LLM Assistants)
 * Fast, deterministic, and zero-cost alternative to LLM-based generation
 * @param {number} jobId 
 * @param {Object} options 
 * @returns {Promise<void>}
 */
async function runTemplateAuditPipeline(jobId, options = {}) {
  await logStep(jobId, 'template_pipeline', 'Starting Template Audit Engine (deterministic, no LLM)');

  const job = await loadJob(jobId);
  const evidencePack = job.evidence_pack_v2_json || {};
  const siteSnapshot = job.site_snapshot_json || {};

  // Enrich site snapshot with crawled page extracts for template scoring.
  // The stored site_snapshot_json is intentionally lightweight (index metadata only),
  // but the template engine needs body text + headings + jsonld extracts to produce
  // credible SEO/GEO + opportunity outputs.
  const crawledPages = await new Promise((resolve, reject) => {
    getCrawledPagesByJobId(jobId, (err, pages) => {
      if (err) return reject(err);
      resolve(pages || []);
    });
  });

  const toHeadingArray = (pageRow) => {
    const out = [];
    const push = (tag, text) => {
      const t = (text || '').toString().trim();
      if (!t) return;
      out.push({ tag, text: t });
    };
    push('h1', pageRow && pageRow.h1_text);
    const h2 = Array.isArray(pageRow && pageRow.h2_json) ? pageRow.h2_json : [];
    const h3 = Array.isArray(pageRow && pageRow.h3_json) ? pageRow.h3_json : [];
    const h6 = Array.isArray(pageRow && pageRow.h6_json) ? pageRow.h6_json : [];
    h2.forEach((t) => push('h2', t && (t.text || t.title || t)));
    h3.forEach((t) => push('h3', t && (t.text || t.title || t)));
    h6.forEach((t) => push('h6', t && (t.text || t.title || t)));
    return out;
  };

  const enrichedPagesIndex = crawledPages.map((p) => ({
    url: p.url,
    normalized_url: p.normalized_url,
    page_type: p.page_type,
    title: p.title || null,
    word_count: p.word_count || 0,
    // Content used for city/entity signals (keep it bounded)
    body_text: (p.content_text || p.text_snippet || '').toString().slice(0, 20000),
    headings: toHeadingArray(p),
    // Structured data extract (normalized)
    jsonld_extracted_json: p.jsonld_extracted_json || null
  }));

  const siteSnapshotForTemplates = {
    ...(siteSnapshot && typeof siteSnapshot === 'object' ? siteSnapshot : {}),
    pages_index: enrichedPagesIndex.length > 0 ? enrichedPagesIndex : (Array.isArray(siteSnapshot.pages_index) ? siteSnapshot.pages_index : [])
  };

  // If admin prefilled a non-city placeholder (e.g. "USA"), try to infer a better city signal
  // from the homepage title/H1 so local SEO/GEO scoring isn't artificially zeroed out.
  const isBadCity = (c) => {
    const s = (c || '').toString().trim().toLowerCase();
    return !s || s === 'usa' || s === 'us' || s === 'united states' || s === 'united states of america';
  };
  if (isBadCity(job.city)) {
    const home = enrichedPagesIndex.find(p => p.page_type === 'home') || enrichedPagesIndex[0] || null;
    const title = (home && home.title) ? String(home.title) : '';
    const h1 = (home && Array.isArray(home.headings)) ? (home.headings.find(h => h.tag === 'h1') || {}).text : '';
    const candidateSource = title || h1 || '';
    // Very conservative: "Snohomish Plumbing ..." -> "Snohomish"
    const m = candidateSource.match(/^([A-Za-z][A-Za-z\s]{2,24})\s+(plumbing|hvac|electric|roofing|remodel|painting|landscaping)\b/i);
    const candidate = m ? m[1].trim() : null;
    if (candidate && !/mcauliffe/i.test(candidate)) {
      await updateJob(jobId, { city: candidate });
      job.city = candidate;
      await logStep(jobId, 'template_pipeline', `City inferred from page signals: ${candidate}`);
    }
  }
  
  // Ensure a stable public slug exists BEFORE generating email/public page
  // This ensures the audit URL is available for email links
  if (!job.public_page_slug) {
    const slug = generatePublicSlug(job);
    await updateJob(jobId, { public_page_slug: slug });
    job.public_page_slug = slug;
    await logStep(jobId, 'template_pipeline', `Public page slug generated: ${slug}`);
  }
  
  try {
    // Step 1: Generate llm_context (replaces A1: Evidence Normalizer)
    await logStep(jobId, 'template_a1', 'Generating normalized context from evidence pack');
    const llmContext = templateEngine.generateLlmContext(evidencePack, siteSnapshotForTemplates);
    
    // Step 2: Run UX analysis (replaces A2: UX Auditor)
    await logStep(jobId, 'template_a2', 'Analyzing UX and conversion path');
    const uxAudit = templateEngine.analyzeUxConversion(llmContext, job, siteSnapshotForTemplates);
    
    // Step 3: Run SEO analysis (replaces A3: SEO Auditor)
    await logStep(jobId, 'template_a3', 'Analyzing Local SEO and GEO signals');
    const seoAudit = templateEngine.analyzeLocalSeo(llmContext, siteSnapshotForTemplates, job);
    
    // Step 4: Generate offer (replaces A4: Offer Strategist)
    await logStep(jobId, 'template_a4', 'Generating offer copy');
    const offerCopy = templateEngine.generateOfferCopy(job, uxAudit, seoAudit);
    
    // Step 5: Generate email (replaces A5: Email Writer)
    await logStep(jobId, 'template_a5', 'Generating outreach email');
    const emailHtml = templateEngine.generateOutreachEmail(job, llmContext, uxAudit, seoAudit);
    
    // Step 6: Generate public page (replaces A6: Page Composer)
    await logStep(jobId, 'template_a6', 'Generating public audit page data');
    const publicPageData = templateEngine.generatePublicPageData(job, llmContext, uxAudit, seoAudit, offerCopy);
    
    // Save all outputs in the same format as LLM assistants (for backwards compatibility)
    await updateJob(jobId, {
      llm_context_json: JSON.stringify(llmContext),
      assistant_outputs_json: JSON.stringify({
        ux_audit_json: uxAudit,
        local_seo_audit_json: seoAudit,
        offer_copy_json: offerCopy,
        llm_context_json: llmContext // Also store in assistant_outputs for easy access
      }),
      public_page_json: JSON.stringify(publicPageData),
      email_html: emailHtml,
      processing_method: 'template_engine_v1' // Flag to track which method was used
    });

    // Step 7: Generate Homepage Proposal (if preset configured)
    // (Keeps parity with the legacy LLM pipeline so "Sample Homepage Preview" isn't blank.)
    await generateHomepageProposal(jobId, job);
    
    await logStep(jobId, 'template_pipeline', 'Template Audit Engine completed successfully');
    
  } catch (error) {
    await logStep(jobId, 'template_pipeline', `Template pipeline error: ${error.message}`);
    throw error;
  }
}

/**
 * Run full assistants pipeline (all 6 assistants in correct order)
 * 
 * Pipeline stages:
 * 1. A1 Evidence Normalizer (MUST succeed)
 * 2. A2 UX Auditor + A3 SEO Auditor (parallel)
 * 3. A4 Offer Strategist (depends on A2+A3)
 * 4. A5 Email Writer + A6 Public Page (parallel, both depend on A4)
 * 
 * @param {number} jobId - Audit job ID
 * @param {Object} options - Options (model/temp/prompt overrides)
 * @returns {Promise<void>}
 */
async function runAssistantsPipeline(jobId, options = {}) {
  await logStep(jobId, 'assistants_pipeline', 'Starting LLM Assistants v1 pipeline (6 assistants)');

  const job = await loadJob(jobId);

  // Ensure a stable public slug exists BEFORE assistants produce links (A5/A6).
  // This avoids sending "#" placeholders into outreach emails.
  if (!job.public_page_slug) {
    const slug = generatePublicSlug(job);
    await updateJob(jobId, { public_page_slug: slug });
    job.public_page_slug = slug;
    await logStep(jobId, 'assistants_pipeline', `Public page slug generated early: ${slug}`);
  }

  // Prepare payload data from job
  const payload_data = {
    job,
    evidence_pack_v2: job.evidence_pack_v2_json || null,
    raw_dump: job.raw_dump_json || null,
    screenshots: job.screenshots_json || {}
  };

  // === STAGE 1: Evidence Normalizer (A1) - MUST SUCCEED ===
  await logStep(jobId, 'assistants_pipeline', 'Stage 1: Evidence Normalizer (A1)');
  
  const a1_result = await runSingleAssistant(jobId, 'evidence_normalizer', payload_data, options);

  if (a1_result.status !== 'ok') {
    throw new Error(`Evidence Normalizer (A1) failed: ${a1_result.error}. Pipeline cannot continue.`);
  }

  // Save llm_context_json and quality warnings
  await updateJob(jobId, {
    llm_context_json: JSON.stringify(a1_result.output),
    data_quality_warnings_json: JSON.stringify(a1_result.output.quality_warnings || [])
  });

  await logStep(jobId, 'assistants_pipeline', `Stage 1 complete. Quality warnings: ${(a1_result.output.quality_warnings || []).length}`);

  // Update payload_data with A1 output
  payload_data.llm_context = a1_result.output;

  // === STAGE 2: UX + SEO Auditors (A2 + A3) - PARALLEL ===
  await logStep(jobId, 'assistants_pipeline', 'Stage 2: UX Auditor (A2) + SEO Auditor (A3) - parallel');

  const [a2_result, a3_result] = await Promise.all([
    runSingleAssistant(jobId, 'ux_conversion_auditor', payload_data, options),
    runSingleAssistant(jobId, 'local_seo_geo_auditor', payload_data, options)
  ]);

  // Check if both succeeded (we can continue even if one fails, but log warnings)
  if (a2_result.status !== 'ok') {
    await logStep(jobId, 'assistants_pipeline', `WARNING: UX Auditor (A2) failed: ${a2_result.error}`);
  }
  if (a3_result.status !== 'ok') {
    await logStep(jobId, 'assistants_pipeline', `WARNING: SEO Auditor (A3) failed: ${a3_result.error}`);
  }

  await logStep(jobId, 'assistants_pipeline', `Stage 2 complete. A2: ${a2_result.status}, A3: ${a3_result.status}`);

  // Update payload_data with A2+A3 outputs
  payload_data.ux_audit_json = a2_result.output;
  payload_data.local_seo_audit_json = a3_result.output;

  // === STAGE 3: Offer Strategist (A4) - DEPENDS ON A2+A3 ===
  await logStep(jobId, 'assistants_pipeline', 'Stage 3: Offer Strategist (A4)');

  const a4_result = await runSingleAssistant(jobId, 'offer_strategist', payload_data, options);

  if (a4_result.status !== 'ok') {
    await logStep(jobId, 'assistants_pipeline', `WARNING: Offer Strategist (A4) failed: ${a4_result.error}`);
  } else {
    await logStep(jobId, 'assistants_pipeline', `Stage 3 complete`);
  }

  // Update payload_data with A4 output
  payload_data.offer_copy_json = a4_result.output;

  // === STAGE 4: Email Writer + Public Page (A5 + A6) - PARALLEL ===
  await logStep(jobId, 'assistants_pipeline', 'Stage 4: Email Writer (A5) + Public Page Composer (A6) - parallel');

  // Build links for A5 and A6
  payload_data.links = {
    audit_landing_url: job.public_page_slug ? `https://maxandjacob.com/${job.public_page_slug}?v=2&audit_id=${jobId}` : '#',
    questionnaire_url: 'https://maxandjacob.com/questionnaire' // TODO: Make configurable
  };

  const [a5_result, a6_result] = await Promise.all([
    runSingleAssistant(jobId, 'outreach_email_writer', payload_data, options),
    runSingleAssistant(jobId, 'public_audit_page_composer', payload_data, options)
  ]);

  if (a5_result.status !== 'ok') {
    await logStep(jobId, 'assistants_pipeline', `WARNING: Email Writer (A5) failed: ${a5_result.error}`);
  }
  if (a6_result.status !== 'ok') {
    await logStep(jobId, 'assistants_pipeline', `WARNING: Public Page Composer (A6) failed: ${a6_result.error}`);
  }

  await logStep(jobId, 'assistants_pipeline', `Stage 4 complete. A5: ${a5_result.status}, A6: ${a6_result.status}`);

  // === SAVE ALL OUTPUTS ===
  const assistant_outputs = {
    ux_audit_json: a2_result.output,
    local_seo_audit_json: a3_result.output,
    offer_copy_json: a4_result.output,
    email_pack_json: a5_result.output,
    public_page_json: a6_result.output
  };

  await updateJob(jobId, {
    assistant_outputs_json: JSON.stringify(assistant_outputs),
    // For backward compatibility, also update old fields
    public_page_json: a6_result.output ? JSON.stringify(a6_result.output) : null
  });

  // Step 7: Generate Homepage Proposal (if preset configured)
  await generateHomepageProposal(jobId, job);

  await logStep(jobId, 'assistants_pipeline', `Pipeline complete. All outputs saved.`);

  // Log summary
  const results = [a1_result, a2_result, a3_result, a4_result, a5_result, a6_result];
  const succeeded = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'failed').length;
  
  await logStep(jobId, 'assistants_pipeline', `Summary: ${succeeded}/6 succeeded, ${failed}/6 failed`);

  // Generate token analytics report
  generateJobReport(jobId);
}

/**
 * Generate Homepage Proposal (Step 7 of pipeline)
 * Creates a dynamic homepage preview using scraped data + preset template
 * 
 * @param {number} jobId - Audit job ID
 * @param {Object} job - Audit job object
 */
async function generateHomepageProposal(jobId, job) {
  try {
    // Skip if no preset configured
    if (!job.preset_id) {
      await logStep(jobId, 'homepage_proposal', 'Skipped - no preset configured');
      return;
    }

    await logStep(jobId, 'homepage_proposal', 'Generating homepage proposal...');

    // Load preset
    const preset = await new Promise((resolve, reject) => {
      getNichePresetById(job.preset_id, (err, preset) => {
        if (err) return reject(err);
        resolve(preset);
      });
    });

    if (!preset) {
      await logStep(jobId, 'homepage_proposal', 'Skipped - preset not found');
      return;
    }

    // Check if template is configured
    const templateSlug = preset.homepage_template_path || preset.slug;
    
    await logStep(jobId, 'homepage_proposal', `Using template: ${templateSlug}`);

    // Load crawled pages
    const crawledPages = await new Promise((resolve, reject) => {
      getCrawledPagesByJobId(jobId, (err, pages) => {
        if (err) return reject(err);
        resolve(pages);
      });
    });

    if (!crawledPages || crawledPages.length === 0) {
      await logStep(jobId, 'homepage_proposal', 'Warning - no crawled pages found, skipping');
      return;
    }

    await logStep(jobId, 'homepage_proposal', `Building template data from ${crawledPages.length} pages...`);

    // Build template data
    const templateData = await homepageBuilder.buildTemplateData(job, crawledPages);

    if (templateData.warnings.length > 0) {
      await logStep(jobId, 'homepage_proposal', `Warnings: ${templateData.warnings.join(', ')}`);
    }

    await logStep(jobId, 'homepage_proposal', `Rendering template: ${templateSlug}.ejs`);

    // Render template
    const proposalHtml = await homepageBuilder.renderTemplate(templateSlug, templateData);

    await logStep(jobId, 'homepage_proposal', `Template rendered (${proposalHtml.length} bytes)`);

    // Save to database
    await updateJob(jobId, {
      homepage_proposal_html: proposalHtml,
      homepage_proposal_data_json: templateData
    });

    await logStep(jobId, 'homepage_proposal', 'Homepage proposal saved successfully');

  } catch (error) {
    console.error('[AUDIT PIPELINE] Homepage proposal generation failed:', error);
    await logStep(jobId, 'homepage_proposal', `Failed: ${error.message}`);
    // Don't fail the whole pipeline if homepage generation fails
  }
}

/**
 * Regenerate all content (email, audit, homepage) with a new business name
 * This updates the business name everywhere without re-scraping
 */
async function regenerateWithNewBusinessName(jobId, newBusinessName) {
  await logStep(jobId, 'regenerate_business_name', `Regenerating all content with new business name: "${newBusinessName}"`);
  
  try {
    // Load job
    let job = await loadJob(jobId);
    
    if (!job) {
      throw new Error(`Audit job ${jobId} not found`);
    }
    
    console.log(`[REGENERATE BUSINESS NAME] Starting for job ${jobId}`);
    console.log(`[REGENERATE BUSINESS NAME] Old name: "${job.company_name || '(not set)'}"`);
    console.log(`[REGENERATE BUSINESS NAME] New name: "${newBusinessName}"`);
    
    const updatedFields = ['company_name'];
    
    // 1. Update company_name in audit_jobs table
    await updateJob(jobId, { company_name: newBusinessName });
    
    // 2. Update evidence pack v2 JSON (if exists)
    if (job.evidence_pack_v2_json) {
      const evidencePack = typeof job.evidence_pack_v2_json === 'string' 
        ? JSON.parse(job.evidence_pack_v2_json) 
        : job.evidence_pack_v2_json;
      
      if (evidencePack) {
        // Update company_name in evidence pack
        evidencePack.company_name = newBusinessName;
        
        // Update company_profile.name in evidence pack
        if (!evidencePack.company_profile) {
          evidencePack.company_profile = {};
        }
        evidencePack.company_profile.name = newBusinessName;
        
        await updateJob(jobId, { evidence_pack_v2_json: evidencePack });
        updatedFields.push('evidence_pack_v2_json');
        console.log(`[REGENERATE BUSINESS NAME] Updated evidence pack v2`);
      }
    }
    
    // 3. Update llm_context_json (if exists)
    if (job.llm_context_json) {
      const llmContext = typeof job.llm_context_json === 'string' 
        ? JSON.parse(job.llm_context_json) 
        : job.llm_context_json;
      
      if (llmContext) {
        if (!llmContext.company_profile) {
          llmContext.company_profile = {};
        }
        llmContext.company_profile.name = newBusinessName;
        
        await updateJob(jobId, { llm_context_json: llmContext });
        updatedFields.push('llm_context_json');
        console.log(`[REGENERATE BUSINESS NAME] Updated llm_context_json`);
      }
    }
    
    // Reload job with updated data
    job = await loadJob(jobId);
    
    // 4. Regenerate email HTML
    if (job.mini_audit_json || job.status === 'ready') {
      try {
        await logStep(jobId, 'regenerate_business_name', 'Regenerating email...');
        
        // Load preset if assigned
        let preset = null;
        if (job.preset_id) {
          preset = await new Promise((resolve, reject) => {
            getNichePresetById(job.preset_id, (err, result) => {
              if (err) return reject(err);
              resolve(result);
            });
          });
        }
        
        const miniAudit = job.mini_audit_json || {};
        const screenshots = job.screenshots_json || {};
        const emailPolish = job.email_polish_json || null;
        
        // Generate new email with updated business name
        const emailHtml = generateEmailHtml(job, miniAudit, screenshots, emailPolish, preset);
        
        // Ensure audit link block is present
        const publicSlug = job.public_page_slug || generatePublicSlug(job);
        const auditUrl = getAuditLandingUrlFromSlug(publicSlug, jobId);
        const companyLabel = newBusinessName;
        const finalEmailHtml = ensureAuditLinkBlockInEmailHtml(
          emailHtml,
          { publicSlug, auditUrl, companyLabel }
        );
        
        await updateJob(jobId, { email_html: finalEmailHtml });
        updatedFields.push('email_html');
        console.log(`[REGENERATE BUSINESS NAME] Regenerated email`);
      } catch (emailErr) {
        console.error(`[REGENERATE BUSINESS NAME] Email regeneration failed:`, emailErr);
        await logStep(jobId, 'regenerate_business_name', `Email regeneration failed: ${emailErr.message}`);
      }
    }
    
    // 5. Regenerate homepage proposal (if exists)
    if (job.homepage_proposal_html || job.homepage_proposal_data_json) {
      try {
        await logStep(jobId, 'regenerate_business_name', 'Regenerating homepage proposal...');
        
        // Load crawled pages
        const crawledPages = await new Promise((resolve, reject) => {
          getCrawledPagesByJobId(jobId, (err, pages) => {
            if (err) return reject(err);
            resolve(pages || []);
          });
        });
        
        if (crawledPages.length > 0) {
          // Rebuild template data with new business name
          const templateData = await homepageBuilder.buildTemplateData(job, crawledPages);
          
          // Get template slug from existing data or use default
          let templateSlug = 'local-service-v2';
          if (job.homepage_proposal_data_json) {
            const existingData = typeof job.homepage_proposal_data_json === 'string'
              ? JSON.parse(job.homepage_proposal_data_json)
              : job.homepage_proposal_data_json;
            if (existingData.template_slug) {
              templateSlug = existingData.template_slug;
            }
          }
          
          // Render template with updated data
          const proposalHtml = await homepageBuilder.renderTemplate(templateSlug, templateData);
          
          await updateJob(jobId, {
            homepage_proposal_html: proposalHtml,
            homepage_proposal_data_json: templateData
          });
          updatedFields.push('homepage_proposal_html', 'homepage_proposal_data_json');
          console.log(`[REGENERATE BUSINESS NAME] Regenerated homepage proposal`);
        } else {
          console.log(`[REGENERATE BUSINESS NAME] No crawled pages found, skipping homepage regeneration`);
        }
      } catch (homepageErr) {
        console.error(`[REGENERATE BUSINESS NAME] Homepage regeneration failed:`, homepageErr);
        await logStep(jobId, 'regenerate_business_name', `Homepage regeneration failed: ${homepageErr.message}`);
      }
    }
    
    await logStep(jobId, 'regenerate_business_name', `Successfully regenerated all content with new business name`);
    console.log(`[REGENERATE BUSINESS NAME] Completed successfully for job ${jobId}`);
    console.log(`[REGENERATE BUSINESS NAME] Updated fields:`, updatedFields);
    
    return {
      success: true,
      updated_fields: updatedFields
    };
    
  } catch (err) {
    console.error(`[REGENERATE BUSINESS NAME] Error for job ${jobId}:`, err);
    await logStep(jobId, 'error', `Business name regeneration failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  processAuditJob,
  runLlmOnly,
  regenerateEmail,
  regeneratePublicPage,
  regenerateEvidencePackV2,
  generateEvidencePack,
  generateEvidencePackV2,
  runSingleAssistant,
  runAssistantsPipeline,
  runTemplateAuditPipeline,
  regenerateWithNewBusinessName
};

