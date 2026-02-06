/**
 * Template Audit Engine - Deterministic audit generation (replaces LLM assistants)
 * 
 * This module replaces all 6 LLM assistants (A1-A6) with template-based logic:
 * - A1: Evidence Normalizer → generateLlmContext()
 * - A2: UX Conversion Auditor → analyzeUxConversion()
 * - A3: Local SEO & GEO Auditor → analyzeLocalSeo()
 * - A4: Offer Strategist → generateOfferCopy()
 * - A5: Outreach Email Writer → generateOutreachEmail()
 * - A6: Public Audit Page Composer → generatePublicPageData()
 * 
 * All outputs match the existing data structure expected by auditViewModelV2.js
 */

const issueDetector = require('./issueDetector');
const copyTemplates = require('./copyTemplates');

/**
 * Generate normalized LLM context from evidence pack (replaces A1: Evidence Normalizer)
 * @param {Object} evidencePack - evidence_pack_v2_json from scraper
 * @param {Object} siteSnapshot - site_snapshot_json from scraper
 * @returns {Object} Normalized llm_context
 */
function generateLlmContext(evidencePack, siteSnapshot = null) {
  if (!evidencePack) {
    return {
      company_profile: {},
      services: {},
      cta_analysis: {},
      trust_evidence: [],
      contact_friction: {},
      quality_warnings: []
    };
  }
  
  // Evidence Pack v2 shape (preferred):
  // - company_profile: { name, phones[], emails[], address|null, hours|null, social_links{...} }
  // - services: { featured[], other_services[], service_areas[] }
  // - cta_map: { primary, cta_candidates[] }
  // - trust: { evidence[] }
  // - contact_form: { contact_form_detected, ... }
  // Keep backwards-compat fallbacks for older shapes.
  const epCompany =
    (evidencePack.company_profile && typeof evidencePack.company_profile === 'object' && !Array.isArray(evidencePack.company_profile))
      ? evidencePack.company_profile
      : {};

  const normalizeSocialLinks = (raw) => {
    // v2 shape: object with arrays by platform
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const out = [];
      Object.values(raw).forEach((v) => {
        if (Array.isArray(v)) out.push(...v.filter(Boolean));
      });
      return out;
    }
    // legacy: array
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  };

  // Extract company profile
  const company_profile = {
    name: epCompany.name || evidencePack.company_name || null,
    phones: Array.isArray(epCompany.phones) ? epCompany.phones : (Array.isArray(evidencePack.phones) ? evidencePack.phones : []),
    emails: Array.isArray(epCompany.emails) ? epCompany.emails : (Array.isArray(evidencePack.emails) ? evidencePack.emails : []),
    address:
      (epCompany.address && typeof epCompany.address === 'object' && !Array.isArray(epCompany.address))
        ? epCompany.address
        : (evidencePack.address && typeof evidencePack.address === 'object' && !Array.isArray(evidencePack.address))
          ? evidencePack.address
          : {},
    hours: epCompany.hours || evidencePack.hours || null,
    opening_hours: epCompany.opening_hours || evidencePack.opening_hours || null,
    social_links: normalizeSocialLinks(epCompany.social_links || evidencePack.social_links)
  };
  
  // Extract services
  const epServices =
    (evidencePack.services && typeof evidencePack.services === 'object' && !Array.isArray(evidencePack.services))
      ? evidencePack.services
      : {};

  const normalizeServiceTitle = (s) => {
    if (!s) return null;
    if (typeof s === 'string') return s.trim() || null;
    if (typeof s === 'object') return (s.title || s.name || '').toString().trim() || null;
    return null;
  };

  const services = {
    featured: (Array.isArray(epServices.featured) ? epServices.featured : (Array.isArray(evidencePack.featured_services) ? evidencePack.featured_services : []))
      .map(normalizeServiceTitle)
      .filter(Boolean),
    other_keywords: (Array.isArray(epServices.other_services) ? epServices.other_services : (Array.isArray(evidencePack.other_service_keywords) ? evidencePack.other_service_keywords : []))
      .map(normalizeServiceTitle)
      .filter(Boolean)
  };
  
  // Extract CTA analysis
  const ctaMap =
    (evidencePack.cta_map && typeof evidencePack.cta_map === 'object' && !Array.isArray(evidencePack.cta_map))
      ? evidencePack.cta_map
      : {};

  const ctas = Array.isArray(ctaMap.cta_candidates)
    ? ctaMap.cta_candidates
    : Array.isArray(evidencePack.cta_candidates)
      ? evidencePack.cta_candidates
      : [];

  const isAboveFold = (c) =>
    c && (c.above_fold === true || c.above_fold_desktop === true || c.above_fold_mobile === true);

  const aboveFoldCtas = Array.isArray(ctas) ? ctas.filter(isAboveFold) : [];
  
  // Determine primary CTA (highest priority above fold CTA)
  let primaryCta = null;

  // Prefer evidencePack v2 primary CTA if present (more reliable than heuristics)
  if (ctaMap.primary && typeof ctaMap.primary === 'object') {
    primaryCta = {
      text: ctaMap.primary.text || ctaMap.primary_cta_text || 'Contact',
      intent: ctaMap.primary.intent || 'contact',
      location: isAboveFold(ctaMap.primary) ? 'above_fold' : 'unknown',
      target: ctaMap.primary.href || null
    };
  }

  if (aboveFoldCtas.length > 0) {
    // Prioritize by intent: call > schedule > quote > contact > other
    const intentPriority = { call: 0, schedule: 1, quote: 2, estimate: 2, contact: 3, book: 1, other: 99 };
    const sorted = [...aboveFoldCtas].sort((a, b) => {
      const aPriority = intentPriority[a.intent] || 99;
      const bPriority = intentPriority[b.intent] || 99;
      return aPriority - bPriority;
    });
    const best = sorted[0];
    if (!primaryCta) {
      primaryCta = {
        text: best.text || 'Contact',
        intent: best.intent || 'contact',
        location: 'above_fold',
        target: best.href || best.target || null
      };
    }
  }
  
  const cta_analysis = {
    primary: primaryCta,
    all_ctas: Array.isArray(ctas) ? ctas.map(c => ({
      text: c.text || '',
      intent: c.intent || 'other',
      above_fold: isAboveFold(c),
      target: c.href || c.target || null
    })) : []
  };
  
  // Extract trust evidence
  const trust_evidence = [];
  
  // Reviews/testimonials
  const epTrust = (evidencePack.trust && typeof evidencePack.trust === 'object' && !Array.isArray(evidencePack.trust)) ? evidencePack.trust : {};
  const trustEvidenceRows = Array.isArray(epTrust.evidence) ? epTrust.evidence : [];
  if (trustEvidenceRows.length > 0) {
    trustEvidenceRows.forEach((row) => {
      trust_evidence.push({
        type: row.type || 'trust',
        snippet: row.snippet || row.value || null,
        value: row.value || null
      });
    });
  } else if (evidencePack.review_snippets && Array.isArray(evidencePack.review_snippets)) {
    evidencePack.review_snippets.forEach(snippet => {
      trust_evidence.push({
        type: 'review_snippet',
        snippet: snippet,
        value: null
      });
    });
  }
  
  // Aggregate rating
  if (evidencePack.aggregate_rating) {
    const rating = evidencePack.aggregate_rating;
    trust_evidence.push({
      type: 'review',
      snippet: `${rating.ratingValue || 0} stars, ${rating.reviewCount || 0} reviews`,
      value: rating.ratingValue || null
    });
  }
  
  // Years in business (from trust patterns or text)
  if (evidencePack.years_in_business) {
    trust_evidence.push({
      type: 'years_in_business',
      value: evidencePack.years_in_business,
      snippet: `${evidencePack.years_in_business} years in business`
    });
  }
  
  // Certifications/badges (from trust patterns)
  if (evidencePack.trust_patterns && Array.isArray(evidencePack.trust_patterns)) {
    evidencePack.trust_patterns.forEach(pattern => {
      if (pattern.toLowerCase().includes('licensed') || 
          pattern.toLowerCase().includes('insured') ||
          pattern.toLowerCase().includes('certified')) {
        trust_evidence.push({
          type: 'certification',
          value: pattern,
          snippet: pattern
        });
      }
    });
  }
  
  // Contact friction analysis
  const hasTelLink = Array.isArray(ctas) ? ctas.some(c => (c && (c.target_type === 'tel' || String(c.href || '').startsWith('tel:') || c.intent === 'call'))) : false;
  const hasCallCtaAboveFold = Array.isArray(ctas) ? ctas.some(c => isAboveFold(c) && (c.intent === 'call' || String(c.href || '').startsWith('tel:'))) : false;
  const phoneInHeader = hasCallCtaAboveFold; // best-effort (we don't know exact DOM location)
  const phoneClickable = hasTelLink;
  const formDetected =
    (evidencePack.contact_form && typeof evidencePack.contact_form === 'object' && evidencePack.contact_form.contact_form_detected === true)
      ? true
      : evidencePack.contact_form_detected === true;
  
  // Estimate clicks to contact
  let clicksToContact = 1;
  if (!phoneInHeader && !formDetected) {
    clicksToContact = 3; // Need to navigate to contact page
  } else if (!phoneInHeader && formDetected) {
    clicksToContact = 2; // Form is somewhere on page
  } else if (phoneInHeader) {
    clicksToContact = 1; // Direct click on header phone
  }
  
  const contact_friction = {
    phone_in_header: phoneInHeader,
    phone_clickable: phoneClickable,
    clicks_to_contact: clicksToContact,
    form_detected: formDetected
  };
  
  // Quality warnings
  const quality_warnings = [];
  
  if (company_profile.phones.length === 0) {
    quality_warnings.push({
      code: 'WARN_PHONE_MISSING',
      severity: 'high',
      message: 'No phone number detected'
    });
  }
  
  if (company_profile.emails.length === 0) {
    quality_warnings.push({
      code: 'WARN_EMAIL_MISSING',
      severity: 'medium',
      message: 'No email found'
    });
  }
  
  if (!company_profile.address || !company_profile.address.street) {
    quality_warnings.push({
      code: 'WARN_ADDRESS_PARTIAL',
      severity: 'medium',
      message: 'Address incomplete (missing street)'
    });
  }
  
  if (!company_profile.hours && !company_profile.opening_hours) {
    quality_warnings.push({
      code: 'WARN_HOURS_MISSING',
      severity: 'low',
      message: 'Business hours not found'
    });
  }
  
  if (!primaryCta) {
    quality_warnings.push({
      code: 'WARN_CTA_UNCLEAR',
      severity: 'medium',
      message: 'Primary CTA not clear/compelling'
    });
  }
  
  if (trust_evidence.length === 0) {
    quality_warnings.push({
      code: 'WARN_TRUST_WEAK',
      severity: 'medium',
      message: 'No trust signals (years, reviews, certifications)'
    });
  }
  
  return {
    company_profile,
    services,
    cta_analysis,
    trust_evidence,
    contact_friction,
    quality_warnings
  };
}

/**
 * Analyze UX and conversion (replaces A2: UX Conversion Auditor)
 * @param {Object} llmContext - Normalized context from generateLlmContext()
 * @param {Object} job - Audit job
 * @param {Object} siteSnapshot - Site snapshot data
 * @returns {Object} UX audit output matching A2 format
 */
function analyzeUxConversion(llmContext, job, siteSnapshot = null) {
  // Calculate scores (0-100)
  const scores = calculateUxScores(llmContext, siteSnapshot);
  
  // Detect top issues
  const top_issues = issueDetector.detectTopIssues(llmContext, job, siteSnapshot);
  
  // Enhance issues with personalized fix steps
  const enhancedIssues = top_issues.slice(0, 5).map(issue => {
    const fixSteps = copyTemplates.generateFixSteps(issue, job, llmContext);
    return {
      problem: issue.title || issue.problem,
      title: issue.title || issue.problem,
      evidence_ref: issue.evidence_ref || [],
      fix_steps: fixSteps,
      why_it_matters: issue.why_it_matters || 'Impacts conversion',
      severity: issue.severity || 'medium'
    };
  });
  
  // Generate quick wins
  const quick_wins = issueDetector.generateQuickWins(top_issues, llmContext);
  
  // Detect mobile issues
  const mobile_issues = issueDetector.detectMobileIssues(llmContext, siteSnapshot);
  
  // Calculate overall UX score
  const ux_score = Math.round(
    (scores.conversion_path * 0.35) +
    (scores.clarity * 0.25) +
    (scores.trust * 0.25) +
    (scores.mobile * 0.15)
  );
  
  return {
    scores,
    ux_score,
    top_issues: enhancedIssues,
    quick_wins,
    mobile_issues
  };
}

/**
 * Calculate UX scores from llm_context
 * @param {Object} llmContext - Normalized context
 * @param {Object} siteSnapshot - Site snapshot
 * @returns {Object} Scores object
 */
function calculateUxScores(llmContext, siteSnapshot) {
  const cta = llmContext.cta_analysis || {};
  const friction = llmContext.contact_friction || {};
  const trust = llmContext.trust_evidence || [];
  const phones = llmContext.company_profile?.phones || [];
  
  // Conversion path score (0-100) - start higher for credibility
  let conversionPath = 65; // Raised from 90 to be more realistic baseline
  if (!cta.primary) conversionPath -= 15; // Reduced penalties
  if (!friction.phone_in_header && phones.length > 0) conversionPath -= 10;
  if (friction.clicks_to_contact > 1) conversionPath -= 5 * Math.min(friction.clicks_to_contact - 1, 3);
  if (!friction.form_detected) conversionPath -= 8;
  // Even with missing data, maintain minimum credibility
  conversionPath = Math.max(45, Math.min(100, conversionPath));
  
  // Clarity score (0-100) - more forgiving
  const services = llmContext.services?.featured || [];
  const hasAddress = Boolean(llmContext.company_profile?.address?.city);
  let clarity = 60; // Start at 60 instead of 70
  if (services.length >= 3) clarity += 15;
  else if (services.length >= 1) clarity += 8; // Partial credit
  if (hasAddress) clarity += 10;
  if (phones.length > 0) clarity += 5;
  // Maintain credible minimum
  clarity = Math.max(55, Math.min(100, clarity));
  
  // Trust score (0-100) - start higher
  const hasReviews = trust.some(t => t.type === 'review' || t.type === 'review_snippet');
  const hasCerts = trust.some(t => t.type === 'certification' || t.type === 'badge');
  const hasYears = trust.some(t => t.type === 'years_in_business');
  const trustCount = [hasReviews, hasCerts, hasYears].filter(Boolean).length;
  // More generous baseline and scaling
  const trustScore = Math.min(100, 48 + (trustCount * 18)); // Start at 48 instead of 40
  
  // Mobile score (0-100) - more optimistic default
  let mobile = 58; // Start at 58 instead of 70 for more realistic but still credible
  if (!friction.phone_clickable && phones.length > 0) mobile -= 12; // Only penalize if phone exists
  if (friction.clicks_to_contact > 2) mobile -= 10;
  if (siteSnapshot && siteSnapshot.lighthouse_mobile_score != null) {
    // Blend with lighthouse but maintain minimum
    mobile = Math.round((mobile * 0.4) + (siteSnapshot.lighthouse_mobile_score * 0.6));
  }
  mobile = Math.max(48, Math.min(100, mobile));
  
  return {
    conversion_path: conversionPath,
    clarity,
    trust: trustScore,
    mobile
  };
}

/**
 * Analyze Local SEO and GEO signals (replaces A3: Local SEO & GEO Auditor)
 * @param {Object} llmContext - Normalized context
 * @param {Object} siteSnapshot - Site snapshot with pages, schema data
 * @param {Object} job - Audit job
 * @returns {Object} SEO audit output matching A3 format
 */
function analyzeLocalSeo(llmContext, siteSnapshot, job) {
  const city = job.city || '';
  const niche = job.niche || '';
  
  // NAP audit
  const nap_audit = analyzeNap(llmContext);
  
  // Schema markup audit
  const schema_markup = analyzeSchemaMarkup(siteSnapshot);
  
  // Local signals audit
  const local_signals = analyzeLocalSignals(siteSnapshot, city);
  
  // GEO ready score (factor-based)
  const geo_ready_score = calculateGeoScore(nap_audit, schema_markup, local_signals);
  
  // Overall SEO score (0-100)
  const seo_score = geo_ready_score.score;
  
  return {
    nap_audit,
    schema_markup,
    local_signals,
    geo_ready_score,
    seo_score
  };
}

/**
 * Analyze NAP (Name, Address, Phone) completeness
 * @param {Object} llmContext - Normalized context
 * @returns {Object} NAP audit data
 */
function analyzeNap(llmContext) {
  const company = llmContext.company_profile || {};
  const issues = [];
  
  // Check phone
  if (!company.phones || company.phones.length === 0) {
    issues.push({
      problem: 'No phone number found',
      impact: 'Critical for local service business visibility',
      fix: 'Add business phone to header, footer, and contact page',
      severity: 'high'
    });
  }
  
  // Check address
  const address = company.address || {};
  const missingAddressParts = [];
  if (!address.street) missingAddressParts.push('street');
  if (!address.city) missingAddressParts.push('city');
  if (!address.region) missingAddressParts.push('state');
  if (!address.postal) missingAddressParts.push('zip');
  
  if (missingAddressParts.length > 0) {
    issues.push({
      problem: `Address incomplete (missing: ${missingAddressParts.join(', ')})`,
      impact: 'Hurts local search visibility and customer trust',
      fix: `Add complete address including ${missingAddressParts.join(', ')}`,
      severity: missingAddressParts.length >= 3 ? 'high' : 'medium'
    });
  }
  
  // Check hours
  if (!company.hours && !company.opening_hours) {
    issues.push({
      problem: 'Business hours not found',
      impact: 'Missing trust signal and Local SEO signal',
      fix: 'Add business hours to footer and LocalBusiness schema',
      severity: 'medium'
    });
  }
  
  return {
    complete: issues.length === 0,
    issues,
    score: Math.max(0, 100 - (issues.length * 25))
  };
}

/**
 * Analyze schema markup (LocalBusiness, Organization, etc.)
 * @param {Object} siteSnapshot - Site snapshot
 * @returns {Object} Schema markup audit
 */
function analyzeSchemaMarkup(siteSnapshot) {
  const pages = siteSnapshot?.pages_index || [];
  const homepage = pages.find(p => p.page_type === 'home') || pages[0];
  
  let hasLocalBusiness = false;
  let hasOrganization = false;
  let localBusinessData = null;
  
  if (homepage && homepage.jsonld_extracted_json) {
    const jsonld = homepage.jsonld_extracted_json;
    const lb = jsonld.localbusiness || null;
    const org = jsonld.organization || null;

    // jsonld_extracted_json may contain a skeleton object with all keys present but null values.
    // We only treat schema as "present" if there is at least one meaningful signal.
    const hasMeaningfulAddress = (addr) => {
      if (!addr || typeof addr !== 'object') return false;
      return Boolean(addr.streetAddress || addr.addressLocality || addr.addressRegion || addr.postalCode || addr.addressCountry);
    };

    hasLocalBusiness = Boolean(
      lb &&
      (lb.name || lb.telephone || hasMeaningfulAddress(lb.address) || lb.geo || lb.hasMap || lb.openingHoursSpecification || lb.aggregateRating ||
        (Array.isArray(lb.areaServed) && lb.areaServed.length > 0))
    );

    hasOrganization = Boolean(
      org &&
      (org.name || org.logo || (Array.isArray(org.sameAs) && org.sameAs.length > 0) || (org.contactPoint && (org.contactPoint.telephone || org.contactPoint.url)))
    );
    
    if (hasLocalBusiness) {
      localBusinessData = {
        name: jsonld.localbusiness.name || null,
        telephone: jsonld.localbusiness.telephone || null,
        address: jsonld.localbusiness.address || null,
        geo: jsonld.localbusiness.geo || null,
        openingHours: jsonld.localbusiness.openingHoursSpecification || null,
        aggregateRating: jsonld.localbusiness.aggregateRating || null
      };
    }
  }
  
  return {
    local_business: {
      present: hasLocalBusiness,
      data: localBusinessData
    },
    organization: {
      present: hasOrganization
    }
  };
}

/**
 * Analyze local signals (city mentions, service area, etc.)
 * @param {Object} siteSnapshot - Site snapshot
 * @param {String} city - Expected city
 * @returns {Object} Local signals audit
 */
function analyzeLocalSignals(siteSnapshot, city) {
  const pages = siteSnapshot?.pages_index || [];
  const homepage = pages.find(p => p.page_type === 'home') || pages[0];
  
  // Count city mentions in homepage
  let cityMentions = 0;
  let cityInH1 = false;
  
  if (homepage && city) {
    const cityLower = city.toLowerCase();
    const title = (homepage.title || '').toLowerCase();
    const bodyText = (homepage.body_text || '').toLowerCase();
    const headings = Array.isArray(homepage.headings) ? homepage.headings : [];
    
    // Check H1
    const h1s = headings.filter(h => h.tag === 'h1');
    cityInH1 = h1s.some(h => (h.text || '').toLowerCase().includes(cityLower));
    
    // Count mentions in body
    const cityRegex = new RegExp(cityLower, 'gi');
    const matches = bodyText.match(cityRegex);
    cityMentions = matches ? matches.length : 0;
  }
  
  // Check for service area page or section
  const hasServiceAreaPage = pages.some(p => 
    p.page_type === 'locations' || 
    (p.url && p.url.toLowerCase().includes('service-area')) ||
    (p.url && p.url.toLowerCase().includes('areas-served'))
  );
  
  return {
    city_mentions: {
      count: cityMentions,
      in_h1: cityInH1,
      recommendation: cityMentions < 3 ? `Add "${city}" to H1, title, and key page sections` : null
    },
    service_area: {
      detected: hasServiceAreaPage,
      recommendation: hasServiceAreaPage ? null : 'Add a service area section listing cities/regions served'
    }
  };
}

/**
 * Calculate GEO ready score with factors
 * @param {Object} napAudit - NAP audit results
 * @param {Object} schemaMarkup - Schema markup audit
 * @param {Object} localSignals - Local signals audit
 * @returns {Object} GEO score with factors
 */
function calculateGeoScore(napAudit, schemaMarkup, localSignals) {
  const factors = [];
  let totalPoints = 0;
  let earnedPoints = 0;
  
  // Factor 1: NAP completeness (25 points) - give partial credit
  const napEarned = Math.max(8, Math.round(napAudit.score * 0.25)); // Minimum 8 points for having a company name
  factors.push({
    factor: 'NAP Completeness',
    points: 25,
    earned: napEarned,
    status: napAudit.score >= 80 ? 'pass' : (napAudit.score >= 40 ? 'partial' : 'fail')
  });
  totalPoints += 25;
  earnedPoints += napEarned;
  
  // Factor 2: LocalBusiness schema (25 points)
  const schemaPoints = schemaMarkup.local_business.present ? 25 : 0;
  factors.push({
    factor: 'LocalBusiness Schema',
    points: 25,
    earned: schemaPoints,
    status: schemaMarkup.local_business.present ? 'pass' : 'fail'
  });
  totalPoints += 25;
  earnedPoints += schemaPoints;
  
  // Factor 3: City in H1 (10 points)
  const h1Points = localSignals.city_mentions.in_h1 ? 10 : 0;
  factors.push({
    factor: 'City in H1',
    points: 10,
    earned: h1Points,
    status: localSignals.city_mentions.in_h1 ? 'pass' : 'fail'
  });
  totalPoints += 10;
  earnedPoints += h1Points;
  
  // Factor 4: City mentions (15 points)
  const cityCount = localSignals.city_mentions.count;
  const cityMentionPoints = Math.min(15, Math.round((cityCount / 5) * 15));
  factors.push({
    factor: 'City Mentions',
    points: 15,
    earned: cityMentionPoints,
    status: cityCount >= 3 ? 'pass' : 'partial'
  });
  totalPoints += 15;
  earnedPoints += cityMentionPoints;
  
  // Factor 5: Service area defined (10 points)
  const serviceAreaPoints = localSignals.service_area.detected ? 10 : 0;
  factors.push({
    factor: 'Service Area',
    points: 10,
    earned: serviceAreaPoints,
    status: localSignals.service_area.detected ? 'pass' : 'fail'
  });
  totalPoints += 10;
  earnedPoints += serviceAreaPoints;
  
  // Factor 6: Opening hours in schema (10 points)
  const hasHours = schemaMarkup.local_business.data?.openingHours != null;
  const hoursPoints = hasHours ? 10 : 0;
  factors.push({
    factor: 'Opening Hours',
    points: 10,
    earned: hoursPoints,
    status: hasHours ? 'pass' : 'fail'
  });
  totalPoints += 10;
  earnedPoints += hoursPoints;
  
  // Factor 7: Aggregate rating (5 points - bonus)
  const hasRating = schemaMarkup.local_business.data?.aggregateRating != null;
  const ratingPoints = hasRating ? 5 : 0;
  factors.push({
    factor: 'Reviews/Rating',
    points: 5,
    earned: ratingPoints,
    status: hasRating ? 'pass' : 'fail'
  });
  totalPoints += 5;
  earnedPoints += ratingPoints;
  
  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  
  return {
    score,
    factors,
    total_points: totalPoints,
    earned_points: earnedPoints
  };
}

/**
 * Generate offer copy (replaces A4: Offer Strategist)
 * @param {Object} job - Audit job
 * @param {Object} uxAudit - UX audit results
 * @param {Object} seoAudit - SEO audit results
 * @returns {Object} Offer copy data
 */
function generateOfferCopy(job, uxAudit, seoAudit) {
  const topIssues = uxAudit.top_issues || [];
  return copyTemplates.generateOfferCopy(job, topIssues);
}

/**
 * Generate outreach email (replaces A5: Outreach Email Writer)
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @param {Object} uxAudit - UX audit results
 * @param {Object} seoAudit - SEO audit results
 * @returns {String} HTML email content
 */
function generateOutreachEmail(job, llmContext, uxAudit, seoAudit) {
  const topIssues = uxAudit.top_issues || [];
  return copyTemplates.generateOutreachEmail(job, llmContext, topIssues);
}

/**
 * Generate public audit page data (replaces A6: Public Audit Page Composer)
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @param {Object} uxAudit - UX audit results
 * @param {Object} seoAudit - SEO audit results
 * @param {Object} offerCopy - Offer copy data
 * @returns {Object} Public page data
 */
function generatePublicPageData(job, llmContext, uxAudit, seoAudit, offerCopy) {
  const topIssues = uxAudit.top_issues || [];
  return copyTemplates.generatePublicPageData(job, llmContext, topIssues);
}

module.exports = {
  generateLlmContext,
  analyzeUxConversion,
  analyzeLocalSeo,
  generateOfferCopy,
  generateOutreachEmail,
  generatePublicPageData
};
