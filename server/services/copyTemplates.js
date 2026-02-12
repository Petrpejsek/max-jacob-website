/**
 * Copy Templates - Template-based text generation for audit system
 * 
 * All templates are deterministic and use real scraped data for personalization.
 * NO LLM calls, just string interpolation with evidence-based data.
 */

/**
 * Generate hero section copy
 * @param {Object} job - Audit job with niche, city, company_name
 * @param {Object} llmContext - Normalized context
 * @returns {Object} Hero section data
 */
function generateHero(job, llmContext) {
  const companyName = llmContext.company_profile?.name || job.company_name || null;
  const niche = job.niche || 'service';
  const city = job.city || 'your area';
  
  // Determine display name (company name or domain fallback)
  let displayName = companyName;
  if (!displayName && job.input_url) {
    try {
      const url = new URL(job.input_url);
      displayName = url.hostname.replace('www.', '');
    } catch {
      displayName = job.input_url;
    }
  }
  
  const headline = `Grow bigger online. More leads, more bookings.`;
  const subheadline = `We rebuild your website in 7 days into a lead magnet that books more calls — mobile-first, trust-heavy, and AI/SEO-ready.`;
  
  return {
    headline,
    subheadline,
    bullets: [
      `Conversion-first concept for ${displayName || 'your business'}`,
      'AI follow-up system so leads get a fast response',
      'A 7-day ship plan (priorities + scope)'
    ],
    company_name: companyName,
    brand_or_domain: displayName,
    niche,
    city
  };
}

/**
 * Generate personalized fix steps for an issue
 * @param {Object} issue - Issue object with title, category, etc.
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @returns {Array} Array of fix step strings
 */
function generateFixSteps(issue, job, llmContext) {
  const title = (issue.title || issue.problem || '').toLowerCase();
  const city = job.city || 'your area';
  const niche = job.niche || 'service';
  
  const phones = Array.isArray(llmContext.company_profile?.phones) ? llmContext.company_profile.phones : [];
  const phone = phones[0] || null;
  const primaryCta = llmContext.cta_analysis?.primary?.text || null;
  const allCtas = Array.isArray(llmContext.cta_analysis?.all_ctas) 
    ? llmContext.cta_analysis.all_ctas.map(c => c.text).filter(Boolean) 
    : [];
  
  const trust = Array.isArray(llmContext.trust_evidence) ? llmContext.trust_evidence : [];
  const hasReviews = trust.some(t => t.type === 'review' || t.type === 'review_snippet' || t.type === 'testimonial');
  const hasYears = trust.some(t => t.type === 'years_in_business');
  const hasBadges = trust.some(t => t.type === 'certification' || t.type === 'badge');
  
  // Phone/Call issues
  if (title.includes('phone') || title.includes('call')) {
    const steps = [];
    if (phone) {
      steps.push(`Add ${phone} as a click-to-call link in the header using tel: protocol`);
      steps.push(`Make it sticky on mobile so ${city} customers can call from any scroll position`);
      steps.push(`Add "tap to call" visual cue on mobile (phone icon + action text)`);
    } else {
      steps.push(`Add your primary business phone to the header as a large, tappable link`);
      steps.push(`Use format: <a href="tel:+12065551234">(206) 555-1234</a> for instant mobile calling`);
      steps.push(`Place phone above the fold on every page, not just contact page`);
      steps.push(`For ${niche} in ${city}, instant phone access can double inquiry rate`);
    }
    return steps;
  }
  
  // Trust/Reviews issues
  if (title.includes('trust') || title.includes('review') || title.includes('testimonial') || title.includes('proof')) {
    const steps = [];
    if (hasReviews) {
      steps.push(`Move your highest-rated customer testimonial above the fold (directly next to CTA)`);
      steps.push(`Include customer name, photo (if available), and 5-star rating visual`);
      steps.push(`Add "200+ 5-star reviews" count if applicable to build ${city} market credibility`);
    } else {
      steps.push(`Add 2-3 customer testimonials above the fold with specific results they achieved`);
      steps.push(`Include "Licensed & Insured" badge prominently near headline (${niche} customers expect this)`);
      steps.push(`Display years in business or job count (e.g., "Serving ${city} since 2010" or "2,000+ jobs completed")`);
    }
    if (hasYears && !hasReviews) {
      steps.push(`Combine years-in-business with customer count: "25+ years, 5,000+ satisfied ${city} customers"`);
    }
    if (hasBadges) {
      steps.push(`Move license/certification badges to hero section (above the fold), not footer where they're hidden`);
    }
    return steps.slice(0, 4);
  }
  
  // CTA clarity issues
  if (title.includes('cta') || title.includes('call-to-action') || title.includes('call to action')) {
    const steps = [];
    if (primaryCta) {
      steps.push(`Make "${primaryCta}" the single dominant CTA (2x larger button, contrasting color)`);
      steps.push(`Remove or de-emphasize competing CTAs within viewport (visitors need one clear path)`);
      steps.push(`Add urgency element: "Call Now - 24/7 Emergency ${niche}" or "Same-Day Service in ${city}"`);
    } else if (allCtas.length > 0) {
      steps.push(`You have multiple CTAs: ${allCtas.slice(0, 3).map(t => `"${t}"`).join(', ')} — choose ONE as primary`);
      steps.push(`Make chosen CTA action-oriented: use "Call Now", "Get Quote", or "Schedule Service" (not "Learn More")`);
      steps.push(`Size primary CTA button prominently (16-18px text, 48px height minimum for thumb-friendly mobile)`);
    } else {
      steps.push(`Add ONE dominant CTA above fold: "Call (XXX) XXX-XXXX for ${niche} Service" or "Request Free Quote"`);
      steps.push(`Make it action-oriented and specific to ${city} ${niche} (urgent/emergency angle works well)`);
      steps.push(`Use contrasting color (orange/red for emergency services) and make button 2x hero text size`);
    }
    steps.push(`Repeat same CTA at 3 points: hero, after services section, footer (consistency builds trust)`);
    return steps.slice(0, 4);
  }
  
  // Contact/Email issues
  if (title.includes('email') || title.includes('contact')) {
    return [
      'Add business email to contact page and footer for visibility',
      'Consider adding a simple contact form for non-urgent inquiries',
      'Include email in LocalBusiness schema markup'
    ];
  }
  
  // Address/NAP issues
  if (title.includes('address') || title.includes('location') || title.includes('nap')) {
    return [
      'Add complete address to footer and contact page (street, city, state, zip)',
      'Include full address in LocalBusiness schema markup',
      `Make it clear that you serve ${city} and surrounding areas`
    ];
  }
  
  // Hours issues
  if (title.includes('hour') || title.includes('hours')) {
    return [
      'Add business hours on website (footer + contact page)',
      'Include opening hours in LocalBusiness schema markup',
      'If you offer 24/7 emergency service, state that prominently'
    ];
  }
  
  // Friction issues
  if (title.includes('friction') || title.includes('click')) {
    return [
      'Add direct phone link or contact form above the fold (0 clicks to see it)',
      'Make primary CTA immediately actionable (call/text/form, not "learn more")',
      'Reduce navigation complexity so visitors reach contact info in 1 click'
    ];
  }
  
  // Form issues
  if (title.includes('form')) {
    return [
      'Add a simple contact/quote request form above the fold',
      'Keep it short: name, phone, service needed (3-4 fields max)',
      'Add instant confirmation so visitors know you received their request'
    ];
  }
  
  // Services issues
  if (title.includes('service')) {
    return [
      `Add a services section above the fold with 3-5 main ${niche} services`,
      'Use clear service names (not jargon) that customers search for',
      'Link each service to a dedicated page with details'
    ];
  }
  
  // Mobile issues
  if (title.includes('mobile')) {
    return [
      'Optimize images and reduce page weight for faster mobile loading',
      'Ensure all tap targets are at least 44x44px (finger-friendly)',
      'Test mobile experience on real devices (iPhone and Android)'
    ];
  }
  
  // Generic fallback (still personalized by niche/city but more detailed)
  return [
    `Rewrite above-the-fold headline to immediately answer: "What ${niche} services do you offer in ${city}?"`,
    `Add ONE dominant CTA button (48px height minimum): "Call for Emergency ${niche}" or "Get Free ${niche} Quote"`,
    `Include 2-3 trust signals above fold: customer count, years in business, or "Licensed & Insured in ${city}"`,
    `Add click-to-call phone number in header (visible on all pages, sticky on mobile scroll)`
  ];
}

/**
 * Generate 7-day plan deliverables
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @param {Array} topIssues - Top issues detected
 * @returns {Array} Array of day-by-day plan items
 */
function generateSevenDayPlan(job, llmContext, topIssues) {
  const city = job.city || 'your area';
  const niche = job.niche || 'service';
  const primaryCta = llmContext.cta_analysis?.primary?.text || null;
  
  // Extract top 2 issue titles for "what we fix" line
  const issueTitles = topIssues
    .map(it => it.title || it.problem)
    .filter(Boolean)
    .slice(0, 2);
  
  const cleanIssueTitle = (t) => {
    return String(t).replace(/^(opportunity|issue|problem)\s*:\s*/i, '').trim();
  };
  
  const whatWeFixLine = issueTitles.length >= 2
    ? `We prioritize the biggest blockers we detected: "${cleanIssueTitle(issueTitles[0])}" + "${cleanIssueTitle(issueTitles[1])}".`
    : issueTitles.length === 1
    ? `We prioritize the biggest blocker: "${cleanIssueTitle(issueTitles[0])}".`
    : 'We prioritize the biggest booking blockers we detected from the scrape.';
  
  const ctaLine = primaryCta
    ? `We'll align everything around one dominant CTA ("${primaryCta}") and remove competing actions near the top.`
    : "We'll define one dominant CTA (Call / Request Service) and make it the obvious next step.";
  
  // Check if there are NAP or schema issues
  const hasNapIssues = topIssues.some(it => (it.category === 'nap' || (it.title && it.title.toLowerCase().includes('address'))));
  const hasSchemaGap = topIssues.some(it => it.title && it.title.toLowerCase().includes('schema'));
  
  const seoLine = (hasSchemaGap || hasNapIssues)
    ? 'Add Local SEO fundamentals (NAP + LocalBusiness schema)'
    : `Strengthen GEO signals for ${city}`;
  
  return [
    {
      day: 1,
      title: 'Diagnose + Plan',
      promise: 'You get a clear plan + priorities',
      deliverables: [
        whatWeFixLine,
        `Confirm goals, service area, and what "a good lead" means`
      ]
    },
    {
      day: '2–4',
      title: 'Build the Lead Magnet',
      promise: 'New above-the-fold + CTA flow (call/text/book)',
      deliverables: [
        `Rewrite headline/subhead so ${niche} customers instantly understand what you do + where you serve`,
        ctaLine
      ]
    },
    {
      day: '4–6',
      title: 'Tracking + Follow-up',
      promise: "Calls/forms tracked + instant response so leads don't go cold",
      deliverables: [
        'Set up tracking + auto-replies so inquiries get instant response',
        seoLine
      ]
    },
    {
      day: 7,
      title: 'QA + Launch + Handoff',
      promise: 'Launch + simple handoff doc',
      deliverables: [
        'Cross-device QA, speed checks, and go-live',
        'Handoff doc: what changed + where to edit + backlog'
      ]
    }
  ];
}

/**
 * Generate outreach email HTML
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @param {Array} topIssues - Top issues detected
 * @returns {String} HTML email content
 */
function generateOutreachEmail(job, llmContext, topIssues) {
  // NOTE: This email is intentionally written as a short, human outreach note.
  // Do NOT include audit issue lists in the email body (hurts deliverability and UX).
  // Also keep the audit link as a simple blue "Audit - {Company}" anchor.
  const companyName = llmContext.company_profile?.name || job.company_name || 'your business';
  const publicSlug = job.public_page_slug || '';
  const auditUrl = publicSlug ? `https://maxandjacob.com/${publicSlug}?v=2` : (job.input_url || 'https://maxandjacob.com');

  const auditLinkLabel = `Audit - ${companyName}`;
  const addressLine = '1221 Brickell Ave, Suite 900, Miami, FL 33131';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#111;">
  <div style="max-width:600px;margin:40px auto;padding:0 20px;">
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">Hi ${companyName} — Jacob here from Max &amp; Jacob.</p>
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">I created a quick free audit of your website. No login required, just a safe preview:</p>
    <p style="margin:0 0 20px 0;">
      <a href="${auditUrl}" target="_blank" rel="noopener" style="color:#2563eb;font-size:16px;font-weight:700;text-decoration:underline;">${auditLinkLabel}</a>
    </p>
    <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;">If it's useful, we can also design a new homepage concept for you in 48 hours — completely free. Just fill out a short brief. No commitment, no sales calls.</p>
    <p style="margin:24px 0 0 0;font-size:16px;line-height:1.6;">Jacob Liesner<br>Max &amp; Jacob<br><a href="mailto:jacob@maxandjacob.com" style="color:#2563eb;text-decoration:none;">jacob@maxandjacob.com</a></p>
    <p style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#94a3b8;">Max &amp; Jacob · ${addressLine} · <a href="https://maxandjacob.com" style="color:#2563eb;text-decoration:none;">maxandjacob.com</a></p>
  </div>
</body>
</html>
`;
}

/**
 * Generate offer copy
 * @param {Object} job - Audit job
 * @param {Array} topIssues - Top issues detected
 * @returns {Object} Offer copy data
 */
function generateOfferCopy(job, topIssues) {
  const niche = job.niche || 'service';
  const city = job.city || 'your area';
  
  return {
    offer_package: {
      name: '7-Day Website Build',
      cta_text: 'Get my 7-Day Build',
      price: '$997',
      original_price: '$1,497',
      deliverables: [
        {
          item: 'Above-fold copy and structure',
          description: 'Specific copy + layout recommendations'
        },
        {
          item: 'Form and CTA flow',
          description: 'Where to place forms and how to simplify them'
        },
        {
          item: 'Trust blocks (reviews/references)',
          description: 'Where and how to add trust signals'
        },
        {
          item: 'Change checklist + priorities',
          description: 'What to do first, what can wait'
        }
      ]
    },
    positioning: {
      headline: `Stop losing ${niche} customers to ${city} competitors`,
      subheadline: `We've identified exactly what's wrong. Now let's fix it in 7 days.`,
      urgency: `${topIssues.length} high-impact issues found`
    }
  };
}

/**
 * Generate public page data (hero, findings, etc.)
 * @param {Object} job - Audit job
 * @param {Object} llmContext - Normalized context
 * @param {Array} topIssues - Top issues detected
 * @returns {Object} Public page data
 */
function generatePublicPageData(job, llmContext, topIssues) {
  const hero = generateHero(job, llmContext);
  
  // Map top issues to findings format expected by view model
  const findings = topIssues.slice(0, 6).map(issue => ({
    title: issue.title || issue.problem,
    why: issue.why_it_matters || 'Impacts conversion',
    fix_steps: issue.fix_steps || [],
    evidence_ref: issue.evidence_ref || [],
    severity: issue.severity || 'medium'
  }));
  
  return {
    hero,
    findings_section: {
      title: 'What we found',
      findings
    }
  };
}

module.exports = {
  generateHero,
  generateFixSteps,
  generateSevenDayPlan,
  generateOutreachEmail,
  generateOfferCopy,
  generatePublicPageData
};
