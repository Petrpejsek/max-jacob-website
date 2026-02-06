/**
 * Issue Detector - Heuristic-based issue detection for audit system
 * 
 * Detects top issues using rule-based logic instead of LLM analysis.
 * All rules are evidence-based and derive from scraped data.
 */

/**
 * Detect top issues from llm_context
 * @param {Object} llmContext - Normalized context with company_profile, services, cta_analysis, etc.
 * @param {Object} job - Audit job (niche, city, input_url)
 * @param {Object} siteSnapshot - Site snapshot with pages_index, lighthouse data, etc.
 * @returns {Array} Array of issues with severity, evidence_ref, and personalized data
 */
function detectTopIssues(llmContext, job, siteSnapshot = null) {
  const issues = [];
  const niche = job.niche || '';
  const city = job.city || 'your area';
  
  const company = llmContext.company_profile || {};
  const phones = Array.isArray(company.phones) ? company.phones.filter(Boolean) : [];
  const emails = Array.isArray(company.emails) ? company.emails.filter(Boolean) : [];
  const address = company.address || {};
  const cta = llmContext.cta_analysis || {};
  const friction = llmContext.contact_friction || {};
  const trustEvidence = Array.isArray(llmContext.trust_evidence) ? llmContext.trust_evidence : [];
  const services = llmContext.services || {};
  
  // Check if niche requires urgent contact (plumbing, HVAC, emergency services)
  const urgentNiches = ['plumbing', 'hvac', 'electrician', 'locksmith', 'towing', 'emergency'];
  const isUrgentNiche = urgentNiches.some(n => niche.toLowerCase().includes(n));
  
  // Issue 1: Phone not clickable (CRITICAL for urgent niches)
  if (phones.length > 0 && friction.phone_clickable === false) {
    issues.push({
      title: 'Phone number is not click-to-call on mobile',
      problem: 'Phone number is not click-to-call on mobile',
      severity: isUrgentNiche ? 'critical' : 'high',
      why_it_matters: `Mobile users need instant tap-to-call for ${niche} services in ${city}`,
      evidence_ref: [
        `llm_context.contact_friction.phone_clickable: false`,
        `llm_context.company_profile.phones[0]: ${phones[0] || 'detected'}`
      ],
      fix_steps: [
        `Make ${phones[0]} a tappable tel: link so mobile users can call instantly`,
        `Add click-to-call button in header that stays visible on scroll`,
        `Test on iPhone and Android to ensure tap-to-call works`
      ],
      category: 'phone',
      impact: 'high',
      phone: phones[0],
      niche,
      city
    });
  }
  
  // Issue 2: Phone not in header
  if (phones.length > 0 && friction.phone_in_header === false) {
    issues.push({
      title: 'Phone number not visible in website header',
      problem: 'Phone number not visible in website header',
      severity: 'high',
      why_it_matters: `${city} customers expect to see phone number immediately for ${niche} services`,
      evidence_ref: [
        `llm_context.contact_friction.phone_in_header: false`,
        `llm_context.company_profile.phones[0]: ${phones[0] || 'detected'}`
      ],
      fix_steps: [
        `Add ${phones[0]} to website header (top-right corner is standard)`,
        `Make it click-to-call with tel: protocol`,
        `Keep it visible on all pages (not just homepage)`
      ],
      category: 'phone',
      impact: 'high',
      phone: phones[0],
      niche,
      city
    });
  }
  
  // Issue 3: No phone detected at all
  if (phones.length === 0) {
    issues.push({
      title: 'No phone number found for the business',
      problem: 'No phone number found for the business',
      severity: 'critical',
      why_it_matters: `High-intent ${city} customers can't call immediately (lost urgent bookings)`,
      evidence_ref: [
        `llm_context.company_profile.phones: [] (empty)`
      ],
      fix_steps: [
        `Add primary business phone to header with click-to-call link`,
        `Display phone number above the fold near main CTA`,
        `Include phone in footer and contact page`
      ],
      category: 'phone',
      impact: 'critical',
      niche,
      city
    });
  }
  
  // Issue 4: Email not found
  if (emails.length === 0) {
    issues.push({
      title: 'No email address found for the business',
      problem: 'No email address found for the business',
      severity: 'high',
      why_it_matters: 'Some customers prefer email contact for non-urgent inquiries',
      evidence_ref: [
        `llm_context.company_profile.emails: [] (empty)`
      ],
      fix_steps: [
        `Add business email to contact page`,
        `Include email in footer for visibility`,
        `Consider adding email to LocalBusiness schema markup`
      ],
      category: 'contact',
      impact: 'medium',
      niche,
      city
    });
  }
  
  // Issue 5: Primary CTA unclear or missing
  const allCtas = Array.isArray(cta.all_ctas) ? cta.all_ctas : [];
  const aboveFoldCtas = allCtas.filter(c => c.above_fold === true);
  
  if (!cta.primary) {
    const ctaTexts = allCtas.map(c => c.text).filter(Boolean).slice(0, 3);
    issues.push({
      title: 'Multiple competing calls-to-action above the fold create confusion',
      problem: 'Multiple competing calls-to-action above the fold create confusion',
      severity: 'high',
      why_it_matters: `${city} visitors don't know what action to take first, causing hesitation`,
      evidence_ref: [
        `llm_context.cta_analysis.primary: null`,
        `llm_context.cta_analysis.all_ctas: ${allCtas.length} CTAs detected`,
        ctaTexts.length > 0 ? `CTAs found: ${ctaTexts.join(', ')}` : ''
      ].filter(Boolean),
      fix_steps: ctaTexts.length > 0
        ? [
            `Choose ONE CTA from: ${ctaTexts.join(', ')} to be the dominant action`,
            `Make it 2x larger and place it above the fold next to headline`,
            `Remove or de-emphasize competing CTAs in the hero section`
          ]
        : [
            `Add ONE clear dominant CTA (Call Now / Request Quote / Schedule Service)`,
            `Place it prominently above the fold`,
            `Repeat the same CTA at 2-3 key scroll points`
          ],
      category: 'cta',
      impact: 'high',
      primaryCta: null,
      allCtas: ctaTexts,
      niche,
      city
    });
  } else if (aboveFoldCtas.length > 3) {
    issues.push({
      title: 'Too many CTAs above the fold causing decision paralysis',
      problem: 'Too many CTAs above the fold causing decision paralysis',
      severity: 'medium',
      why_it_matters: 'Too many options make visitors hesitate instead of taking action',
      evidence_ref: [
        `llm_context.cta_analysis.primary.text: ${cta.primary.text}`,
        `Above-fold CTAs: ${aboveFoldCtas.length} (too many)`
      ],
      fix_steps: [
        `Keep "${cta.primary.text}" as the primary CTA and make it dominant`,
        `Remove or move ${aboveFoldCtas.length - 2} competing CTAs below the fold`,
        `Keep maximum 2 CTAs above fold: primary + one secondary (e.g., Learn More)`
      ],
      category: 'cta',
      impact: 'medium',
      primaryCta: cta.primary.text,
      niche,
      city
    });
  }
  
  // Issue 6: High contact friction (too many clicks)
  if (friction.clicks_to_contact != null && friction.clicks_to_contact > 2) {
    issues.push({
      title: 'Too many clicks required to contact you',
      problem: 'Too many clicks required to contact you',
      severity: cta.primary ? 'medium' : 'high',
      why_it_matters: `Every extra click loses ${city} customers who want quick ${niche} service`,
      evidence_ref: [
        `llm_context.contact_friction.clicks_to_contact: ${friction.clicks_to_contact}`,
        `Target: 1 click from above the fold`
      ],
      fix_steps: [
        `Add direct phone link or contact form above the fold (0 clicks to see it)`,
        `Make primary CTA immediately actionable (call/text/form, not "learn more")`,
        `Reduce current ${friction.clicks_to_contact} clicks down to 1 click maximum`
      ],
      category: 'friction',
      impact: 'high',
      niche,
      city
    });
  }
  
  // Issue 7: No contact form detected
  if (friction.form_detected === false) {
    issues.push({
      title: 'No request form detected for non-phone inquiries',
      problem: 'No request form detected for non-phone inquiries',
      severity: 'medium',
      why_it_matters: 'You are missing leads from customers who prefer forms over calling',
      evidence_ref: [
        `llm_context.contact_friction.form_detected: false`
      ],
      fix_steps: [
        `Add a simple contact/quote request form above the fold`,
        `Keep it short: name, phone, service needed (3-4 fields max)`,
        `Add instant confirmation so visitors know you received their request`
      ],
      category: 'conversion',
      impact: 'medium',
      niche,
      city
    });
  }
  
  // Issue 8: Trust signals weak or missing
  const hasReviews = trustEvidence.some(t => t.type === 'review' || t.type === 'review_snippet' || t.type === 'testimonial');
  const hasCerts = trustEvidence.some(t => t.type === 'certification' || t.type === 'badge');
  const hasYears = trustEvidence.some(t => t.type === 'years_in_business');
  const trustCount = [hasReviews, hasCerts, hasYears].filter(Boolean).length;
  
  if (trustCount < 2) {
    const missing = [];
    if (!hasReviews) missing.push('reviews/testimonials');
    if (!hasCerts) missing.push('license/insurance badges');
    if (!hasYears) missing.push('years in business');
    
    issues.push({
      title: 'Not enough proof/trust signals above the fold',
      problem: 'Not enough proof/trust signals above the fold',
      severity: 'medium',
      why_it_matters: `${city} customers need reasons to choose you over competitors`,
      evidence_ref: [
        `llm_context.trust_evidence.length: ${trustEvidence.length}`,
        `Missing: ${missing.join(', ')}`
      ],
      fix_steps: hasReviews
        ? [
            `Move your strongest review snippet above the fold near the CTA`,
            `Add license/insured badges if you have them`,
            `Display years in business or "Serving ${city} since YYYY"`
          ]
        : [
            `Add 2-3 customer testimonials/reviews above the fold`,
            `Display license, insurance, or certification badges near CTA`,
            `Add credibility markers: years in business, jobs completed, etc.`
          ],
      category: 'trust',
      impact: 'medium',
      hasReviews,
      hasCerts,
      hasYears,
      niche,
      city
    });
  }
  
  // Issue 9: Address incomplete (NAP)
  const hasStreet = Boolean(address.street);
  const hasCity = Boolean(address.city);
  const hasRegion = Boolean(address.region);
  const hasPostal = Boolean(address.postal);
  const hasCountry = Boolean(address.country);
  const hasAnyAddress = hasStreet || hasCity || hasRegion || hasPostal || hasCountry;
  
  if (hasAnyAddress && (!hasStreet || !hasCity || !hasRegion || !hasPostal)) {
    const missingParts = [];
    if (!hasStreet) missingParts.push('street');
    if (!hasCity) missingParts.push('city');
    if (!hasRegion) missingParts.push('state');
    if (!hasPostal) missingParts.push('zip');
    
    issues.push({
      title: 'Address is incomplete for local visibility',
      problem: 'Address is incomplete for local visibility',
      severity: 'medium',
      why_it_matters: 'Incomplete address hurts Local SEO and customer trust',
      evidence_ref: [
        `llm_context.company_profile.address: incomplete`,
        `Missing: ${missingParts.join(', ')}`
      ],
      fix_steps: [
        `Complete your address with: ${missingParts.join(', ')}`,
        `Add full address to footer and contact page`,
        `Include complete address in LocalBusiness schema markup`
      ],
      category: 'nap',
      impact: 'medium',
      niche,
      city
    });
  } else if (!hasAnyAddress) {
    issues.push({
      title: 'Address / service location not clearly detected',
      problem: 'Address / service location not clearly detected',
      severity: 'high',
      why_it_matters: `${city} customers and Google need to know your service location`,
      evidence_ref: [
        `llm_context.company_profile.address: null or empty`
      ],
      fix_steps: [
        `Add your business address to the website (footer + contact page)`,
        `Or specify service area if you don't have a physical location`,
        `Include location info in LocalBusiness schema markup`
      ],
      category: 'nap',
      impact: 'high',
      niche,
      city
    });
  }
  
  // Issue 10: Business hours missing
  if (!company.hours && !company.opening_hours) {
    issues.push({
      title: 'Business hours are missing or hard to find',
      problem: 'Business hours are missing or hard to find',
      severity: 'medium',
      why_it_matters: 'Hours are a trust signal and help with Local SEO',
      evidence_ref: [
        `llm_context.company_profile.hours: null`,
        `llm_context.company_profile.opening_hours: null`
      ],
      fix_steps: [
        `Add business hours on website (footer + contact page)`,
        `Include hours in LocalBusiness schema markup`,
        `If you offer 24/7 emergency service, state that clearly`
      ],
      category: 'nap',
      impact: 'low',
      niche,
      city
    });
  }
  
  // Issue 11: Services not clearly featured
  const featuredServices = Array.isArray(services.featured) ? services.featured : [];
  if (featuredServices.length === 0) {
    issues.push({
      title: 'Services are not clearly featured or easy to find',
      problem: 'Services are not clearly featured or easy to find',
      severity: 'medium',
      why_it_matters: `${city} customers need to quickly see what ${niche} services you offer`,
      evidence_ref: [
        `llm_context.services.featured: [] (empty or not detected)`
      ],
      fix_steps: [
        `Add a services section above the fold with 3-5 main services`,
        `Use clear service names (not jargon) that customers search for`,
        `Link each service to a dedicated page with details`
      ],
      category: 'clarity',
      impact: 'medium',
      niche,
      city
    });
  }
  
  // Sort by severity and limit to top 10
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    // Within same severity, prioritize phone/CTA/trust
    const categoryOrder = { phone: 0, cta: 1, trust: 2, nap: 3, conversion: 4, friction: 5, contact: 6, clarity: 7 };
    return (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99);
  });
  
  return issues.slice(0, 10);
}

/**
 * Detect mobile-specific issues
 * @param {Object} llmContext - Normalized context
 * @param {Object} siteSnapshot - Site snapshot with lighthouse data
 * @returns {Array} Array of mobile issues
 */
function detectMobileIssues(llmContext, siteSnapshot = null) {
  const issues = [];
  
  const friction = llmContext.contact_friction || {};
  const phones = Array.isArray(llmContext.company_profile?.phones) ? llmContext.company_profile.phones : [];
  
  // Mobile: Phone not clickable
  if (phones.length > 0 && friction.phone_clickable === false) {
    issues.push({
      problem: 'Phone number is not tap-to-call on mobile',
      evidence_ref: ['llm_context.contact_friction.phone_clickable: false'],
      fix: `Make ${phones[0]} a tappable tel: link for instant mobile calling`
    });
  }
  
  // Mobile: Lighthouse mobile score
  if (siteSnapshot && siteSnapshot.lighthouse_mobile_score != null) {
    const mobileScore = siteSnapshot.lighthouse_mobile_score;
    if (mobileScore < 50) {
      issues.push({
        problem: 'Poor mobile performance (Lighthouse score < 50)',
        evidence_ref: [`lighthouse_mobile_score: ${mobileScore}`],
        fix: 'Optimize images, reduce JavaScript, improve Core Web Vitals'
      });
    }
  }
  
  // Mobile: Small text or tap targets (heuristic based on friction)
  if (friction.clicks_to_contact != null && friction.clicks_to_contact > 2) {
    issues.push({
      problem: 'Too many taps required to contact on mobile',
      evidence_ref: [`llm_context.contact_friction.clicks_to_contact: ${friction.clicks_to_contact}`],
      fix: 'Add sticky tap-to-call button that stays visible on mobile'
    });
  }
  
  return issues.slice(0, 3);
}

/**
 * Generate quick wins from detected issues
 * @param {Array} topIssues - Top issues detected
 * @param {Object} llmContext - Normalized context
 * @returns {Array} Array of quick win strings
 */
function generateQuickWins(topIssues, llmContext) {
  const wins = [];
  const phones = Array.isArray(llmContext.company_profile?.phones) ? llmContext.company_profile.phones : [];
  const cta = llmContext.cta_analysis || {};
  
  // Quick win from top issues
  topIssues.slice(0, 3).forEach(issue => {
    if (issue.category === 'phone' && phones.length > 0) {
      wins.push(`Add click-to-call phone link to header: ${phones[0]}`);
    } else if (issue.category === 'cta' && cta.primary) {
      wins.push(`Make "${cta.primary.text}" the single dominant CTA above the fold`);
    } else if (issue.category === 'trust') {
      wins.push(`Add 2-3 customer reviews/testimonials above the fold`);
    } else if (issue.fix_steps && issue.fix_steps[0]) {
      wins.push(issue.fix_steps[0]);
    }
  });
  
  // Add generic quick wins if we don't have enough
  if (wins.length < 3 && phones.length > 0 && !wins.some(w => w.includes('phone'))) {
    wins.push(`Make phone number ${phones[0]} visible in header`);
  }
  
  if (wins.length < 3 && !wins.some(w => w.includes('CTA'))) {
    wins.push('Add one clear primary CTA above the fold (Call Now / Get Quote)');
  }
  
  if (wins.length < 3 && !wins.some(w => w.includes('trust') || w.includes('review'))) {
    wins.push('Display license/insurance badges and customer reviews');
  }
  
  // Deduplicate and return
  const unique = [...new Set(wins)];
  return unique.slice(0, 7);
}

module.exports = {
  detectTopIssues,
  detectMobileIssues,
  generateQuickWins
};
