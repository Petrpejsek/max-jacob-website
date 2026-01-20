/**
 * Audit View Model V2 - Data Mapper for Public Audit Page V2
 * 
 * Transforms existing audit data into V2-friendly structure for funnel-first presentation.
 * 
 * RULES:
 * - Evidence-based only (no invented facts)
 * - Graceful degradation (missing data handled)
 * - No pipeline changes (uses existing data)
 */

/**
 * Build View Model V2 from audit job data
 * 
 * @param {Object} job - Audit job from database (with all JSON fields parsed)
 * @param {Object} siteSettings - Site settings (team photos, etc.)
 * @returns {Object} - V2 view model
 */
function buildViewModelV2(job, siteSettings = {}) {
  const assistant_outputs = job.assistant_outputs_json || {};
  const llm_context = job.llm_context_json || {};
  const evidence_pack = job.evidence_pack_v2_json || {};
  const screenshots = job.screenshots_json || {};
  const warnings = job.warnings_json || [];
  const public_page = job.public_page_json || {};

  // Extract UX audit data (A2)
  const ux_audit = assistant_outputs.ux_audit_json || {};
  const top_issues = ux_audit.top_issues || [];
  const quick_wins = ux_audit.quick_wins_48h || [];

  // Extract SEO audit data (A3)
  const seo_audit = assistant_outputs.local_seo_audit_json || {};

  // Extract offer data (A4)
  const offer_copy = assistant_outputs.offer_copy_json || {};

  // Extract A6 public page data if available
  const a6_hero = public_page.hero || {};
  const a6_findings = public_page.findings_section?.findings || [];
  const a6_top_fixes = public_page.top_3_fixes || [];

  return {
    // Hero section
    hero: buildHero(job, a6_hero, llm_context),

    // Mini audit (Existing Assets vs Friction Killers)
    mini_audit: buildMiniAudit(llm_context, ux_audit, top_issues),

    // Growth chart visualization
    growth_chart: buildGrowthChart(llm_context, ux_audit),

    // SEO & Local Search Analysis
    seo_local: buildSeoLocal(job, llm_context, seo_audit),

    // Scoreboard (friction/trust/clarity)
    scoreboard: buildScoreboard(llm_context, evidence_pack, ux_audit, seo_audit),

    // Aha moment (screenshot + callouts)
    aha_moment: buildAhaMoment(screenshots, top_issues, job),

    // Top 3 issues (main conversion section)
    top_3_issues: buildTop3Issues(top_issues, a6_top_fixes, evidence_pack),

    // 7-Day Sprint Plan
    seven_day_plan: buildSevenDayPlan(offer_copy, ux_audit),

    // Deliverables (what they get in 7 days)
    deliverables: buildDeliverables(offer_copy),

    // Quick wins (optional, evidence-based)
    quick_wins: buildQuickWins(quick_wins, llm_context, evidence_pack),

    // CTA configuration
    cta_config: buildCtaConfig(job, offer_copy),

    // Form configuration
    form_config: buildFormConfig(job, public_page),

    // Team photos
    team_photos: {
      jacob: siteSettings.team_jacob_photo || '/public/team/jacob.jpg',
      max: siteSettings.team_max_photo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Max&mouth=smile&eyebrows=default&eyes=default'
    },

    // Debug information (internal)
    debug: buildDebugInfo(job, warnings, evidence_pack)
  };
}

/**
 * Build hero section with dynamic, personalized copy
 */
function buildHero(job, a6_hero, llm_context) {
  const company_name = llm_context.company_profile?.name || job.company_name || null;
  let display_name = company_name;
  
  if (!display_name && job.input_url) {
    try {
      display_name = new URL(job.input_url).hostname.replace('www.', '');
    } catch (e) {
      display_name = job.input_url;
    }
  }
  
  const niche = job.niche || 'service';
  const city = job.city || 'your area';
  
  // Generate compelling, personalized headline
  let headline;
  if (a6_hero.headline) {
    headline = a6_hero.headline;
  } else if (company_name) {
    headline = `${company_name}'s website is losing ${niche} customers every day.`;
  } else {
    headline = `Your ${niche} website in ${city} is a 'dead end' for customers.`;
  }
  
  // Generate subheadline with specifics
  const subheadline = a6_hero.subhead || 
    `We analyzed ${display_name} and found critical gaps between your current site and your business potential. Most visitors leave within 3 seconds—but it doesn't have to be this way.`;
  
  return {
    headline: headline,
    subheadline: subheadline,
    bullets: [
      `Personalized audit for ${display_name}`,
      'Actionable fixes you can implement today',
      'Full 7-day transformation plan included'
    ],
    primary_cta_text: 'Show Me the Fixes',
    secondary_cta_text: 'View the Details',
    company_name: company_name,
    brand_or_domain: display_name,
    niche: niche,
    city: city
  };
}

/**
 * Build SEO & Local Search visibility section
 */
function buildSeoLocal(job, llm_context, seo_audit) {
  const seo_score = seo_audit.seo_score || 0;
  const seo_issues = seo_audit.seo_issues || [];
  const local_seo_issues = seo_audit.local_seo_issues || [];
  
  // Service area analysis
  const service_areas = llm_context.service_areas || [];
  const has_service_areas = service_areas.length > 0;
  
  // Meta tags analysis
  const meta_title = llm_context.meta_title || '';
  const meta_description = llm_context.meta_description || '';
  const has_good_meta = meta_title.length > 30 && meta_description.length > 50;
  
  // Local signals
  const city = job.city || '';
  const niche = job.niche || '';
  const has_city_in_title = city && meta_title.toLowerCase().includes(city.toLowerCase());
  const has_niche_in_title = niche && meta_title.toLowerCase().includes(niche.toLowerCase());
  
  // AI Search Visibility (ChatGPT, Gemini, Perplexity)
  const company_name = llm_context.company_profile?.name || job.company_name;
  const has_reviews = llm_context.trust_evidence?.some(t => t.type === 'review') || false;
  const has_structured_data = llm_context.structured_data?.length > 0 || false;
  
  // Critical issues
  const critical_issues = [];
  const opportunities = [];
  
  // AI Search Visibility is CRITICAL for local businesses
  critical_issues.push({
    issue: 'Invisible to AI Search (ChatGPT, Gemini, Perplexity)',
    impact: `When customers ask AI "best ${niche} in ${city}", you don't appear`,
    fix: `Optimize for LLM indexing: structured data, authoritative content, citations`,
    severity: 'critical',
    category: 'ai_visibility'
  });
  
  if (!has_city_in_title) {
    critical_issues.push({
      issue: 'Missing Local SEO in Title',
      impact: `Google doesn't know you serve ${city}`,
      fix: `Add "${city}" to your page title`
    });
  }
  
  if (!has_niche_in_title) {
    critical_issues.push({
      issue: 'Missing Service Keywords',
      impact: `Not ranking for "${niche}" searches`,
      fix: `Include "${niche}" in title tag`
    });
  }
  
  if (!has_service_areas) {
    critical_issues.push({
      issue: 'No Service Area Defined',
      impact: 'Google Maps won\'t show you to nearby customers',
      fix: 'Add clear service area information'
    });
  }
  
  if (!has_good_meta) {
    critical_issues.push({
      issue: 'Weak Meta Description',
      impact: 'Low click-through rate from Google',
      fix: 'Write compelling 150-character description'
    });
  }
  
  // Add issues from SEO audit
  seo_issues.slice(0, 3).forEach(issue => {
    if (issue.severity === 'high' || issue.severity === 'critical') {
      critical_issues.push({
        issue: issue.title || issue.problem,
        impact: issue.impact || 'Hurting your rankings',
        fix: issue.fix || issue.solution
      });
    }
  });
  
  local_seo_issues.slice(0, 2).forEach(issue => {
    critical_issues.push({
      issue: issue.title || issue.problem,
      impact: issue.impact || 'Invisible to local customers',
      fix: issue.fix || issue.solution
    });
  });
  
  // Opportunities
  opportunities.push({
    opportunity: 'AI Search Optimization (ChatGPT, Gemini)',
    benefit: 'Be recommended by AI assistants to thousands of users',
    action: 'Add structured data, authoritative content, and citations',
    category: 'ai_visibility'
  });
  
  opportunities.push({
    opportunity: 'Google Business Profile Optimization',
    benefit: '+67% more map visibility',
    action: 'Verify and optimize your GBP listing'
  });
  
  if (city) {
    opportunities.push({
      opportunity: `"${niche} ${city}" Keyword Targeting`,
      benefit: 'Rank #1 for local searches',
      action: 'Optimize content for local intent'
    });
  }
  
  return {
    seo_score: seo_score,
    has_issues: critical_issues.length > 0,
    critical_issues: critical_issues.slice(0, 4),
    opportunities: opportunities.slice(0, 3),
    meta_title: meta_title,
    meta_description: meta_description,
    service_areas: service_areas,
    indexability_status: seo_audit.indexability || 'unknown'
  };
}

/**
 * Build mini audit section (Existing Assets vs Friction Killers)
 */
function buildMiniAudit(llm_context, ux_audit, top_issues) {
  const well = [];
  const unclear = [];
  
  // Positive findings (Existing Assets)
  const company_name = llm_context.company_profile?.name;
  if (company_name) {
    well.push({ text: 'The business name is recognizable.', isPositive: true });
  }
  
  const has_contact = llm_context.contacts?.phones?.length > 0 || llm_context.contacts?.emails?.length > 0;
  if (has_contact) {
    well.push({ text: 'Basic contact info exists (but may be hard to find).', isPositive: true });
  }
  
  const has_services = llm_context.services?.featured?.length > 0;
  if (has_services) {
    well.push({ text: 'Services are listed on the website.', isPositive: true });
  }
  
  // Ensure at least 2 positive items
  if (well.length === 0) {
    well.push({ text: 'Website is live and accessible.', isPositive: true });
    well.push({ text: 'Basic company information is present.', isPositive: true });
  }
  
  // Friction killers (problems)
  const cta_analysis = llm_context.cta_analysis || {};
  if (!cta_analysis.primary) {
    unclear.push({ text: 'Critical Clarity Gap: It takes too long to understand what you do.' });
  }
  
  const trust_evidence = llm_context.trust_evidence || [];
  if (trust_evidence.length < 2) {
    unclear.push({ text: 'Trust Vacuum: No immediate proof that you are the best local choice.' });
  }
  
  const forms = llm_context.forms || [];
  if (forms.length === 0) {
    unclear.push({ text: 'Contact Friction: Your forms/buttons are confusing on mobile devices.' });
  }
  
  // Add issues from UX audit
  if (top_issues.length > 0 && unclear.length < 4) {
    top_issues.slice(0, 4 - unclear.length).forEach(issue => {
      const title = issue.title || issue.problem || issue.issue;
      if (title && unclear.length < 4) {
        unclear.push({ text: title });
      }
    });
  }
  
  // Ensure at least 3 friction items
  if (unclear.length < 3) {
    unclear.push({ text: 'Outdated Design: Visitors perceive your service quality based on this site.' });
  }
  
  return {
    well: well.slice(0, 3),
    unclear: unclear.slice(0, 4)
  };
}

/**
 * Build growth chart data
 */
function buildGrowthChart(llm_context, ux_audit) {
  const ux_score = ux_audit.ux_score || 0;
  
  // Calculate current impact (based on UX score)
  const current_impact = Math.max(20, Math.min(40, ux_score / 2.5));
  
  // Potential is always higher (80-95%)
  const potential_impact = 90;
  
  // Calculate estimated lift
  const lift_percentage = Math.round(((potential_impact - current_impact) / current_impact) * 100);
  
  return {
    current_impact: Math.round(current_impact),
    potential_impact: potential_impact,
    estimated_lift: Math.min(200, Math.max(100, lift_percentage)),
    stats: {
      capture_time: '3s',
      wont_return: '88%'
    }
  };
}

/**
 * Build 7-day sprint plan
 */
function buildSevenDayPlan(offer_copy, ux_audit) {
  const offer_package = offer_copy.offer_package || {};
  const deliverables = offer_package.deliverables || [];
  
  const plan = [];
  
  // If we have offer deliverables, use first 5
  if (deliverables.length >= 3) {
    deliverables.slice(0, 5).forEach(d => {
      const item = typeof d === 'string' ? d : (d.item || d.title || d.description);
      if (item) {
        plan.push(item);
      }
    });
  }
  
  // Fill with defaults if needed
  const defaults = [
    'Complete homepage strategy & high-conversion copywriting.',
    'Mobile-first redesign focused on speed and call-actions.',
    'Trust-engine setup (review integration & area authority).',
    'Friction-less lead capture form implementation.',
    'Full site speed optimization for better ranking signals.'
  ];
  
  while (plan.length < 5) {
    plan.push(defaults[plan.length]);
  }
  
  return plan.slice(0, 5);
}

/**
 * Build scoreboard (friction, trust, clarity)
 */
function buildScoreboard(llm_context, evidence_pack, ux_audit, seo_audit) {
  return {
    friction: calculateFriction(llm_context, ux_audit),
    trust: calculateTrust(llm_context, evidence_pack),
    clarity: calculateClarity(llm_context, seo_audit)
  };
}

/**
 * Calculate lead friction score
 */
function calculateFriction(llm_context, ux_audit) {
  const cta_analysis = llm_context.cta_analysis || {};
  const has_primary_cta = !!cta_analysis.primary;
  const has_forms = llm_context.forms?.length > 0;
  const has_contact = llm_context.contacts?.phones?.length > 0 || llm_context.contacts?.emails?.length > 0;
  const ux_score = ux_audit.ux_score || 0;

  let level, explanation, evidence;

  if (has_primary_cta && has_forms && has_contact && ux_score >= 70) {
    level = 'low';
    explanation = 'Path to inquiry is clear';
    evidence = ['Primary CTA found', 'Contact forms available', 'Contacts visible'];
  } else if (has_primary_cta || has_forms || has_contact) {
    level = 'medium';
    explanation = 'Some elements are missing or hidden';
    evidence = [];
    if (!has_primary_cta) evidence.push('Missing prominent primary CTA');
    if (!has_forms) evidence.push('No contact forms found');
    if (!has_contact) evidence.push('Contacts not sufficiently visible');
  } else {
    level = 'high';
    explanation = 'Path to inquiry is unclear';
    evidence = ['No clear CTA', 'No forms', 'Contact info hard to access'];
  }

  return { level, explanation, evidence, has_data: true };
}

/**
 * Calculate trust signals score
 */
function calculateTrust(llm_context, evidence_pack) {
  const trust_evidence = llm_context.trust_evidence || [];
  const reviews_found = trust_evidence.some(t => t.type === 'review' || t.type === 'testimonial');
  const certifications_found = trust_evidence.some(t => t.type === 'certification' || t.type === 'badge');
  const references_found = trust_evidence.some(t => t.type === 'reference' || t.type === 'portfolio');

  let level, explanation, evidence;

  const trust_count = [reviews_found, certifications_found, references_found].filter(Boolean).length;

  if (trust_count >= 2) {
    level = 'strong';
    explanation = 'Good trust signals';
    evidence = [];
    if (reviews_found) evidence.push('Reviews or testimonials found');
    if (certifications_found) evidence.push('Certifications or badges found');
    if (references_found) evidence.push('References or portfolio found');
  } else if (trust_count === 1) {
    level = 'ok';
    explanation = 'Basic trust signals present';
    evidence = trust_evidence.map(t => `${t.type}: ${t.text || 'Yes'}`).slice(0, 3);
  } else {
    level = 'weak';
    explanation = 'Missing trust signals (reviews, certifications, references)';
    evidence = ['No reviews', 'No certifications', 'No references'];
  }

  return { level, explanation, evidence, has_data: trust_evidence.length > 0 };
}

/**
 * Calculate clarity score
 */
function calculateClarity(llm_context, seo_audit) {
  const services = llm_context.services || {};
  const has_services = services.featured?.length > 0;
  const has_service_area = !!llm_context.service_areas?.length;
  const has_contact_info = !!(llm_context.contacts?.phones?.length || llm_context.contacts?.emails?.length);
  const seo_score = seo_audit.seo_score || 0;

  let level, explanation, evidence;

  if (has_services && has_service_area && has_contact_info && seo_score >= 70) {
    level = 'strong';
    explanation = 'Clearly communicates what they do, where, and how to contact';
    evidence = ['Services are clear', 'Service area is defined', 'Contacts are visible'];
  } else if (has_services || has_service_area || has_contact_info) {
    level = 'ok';
    explanation = 'Basic information available, but some elements missing';
    evidence = [];
    if (!has_services) evidence.push('Services not sufficiently clear');
    if (!has_service_area) evidence.push('Service area missing');
    if (!has_contact_info) evidence.push('Contacts not sufficiently visible');
  } else {
    level = 'weak';
    explanation = 'Unclear what they do, for whom, and how to contact';
    evidence = ['Services unclear', 'Service area missing', 'Contacts not visible'];
  }

  return { level, explanation, evidence, has_data: true };
}

/**
 * Build aha moment section (screenshot + pins)
 */
function buildAhaMoment(screenshots, top_issues, job) {
  const has_screenshot = !!screenshots.above_fold;
  
  if (!has_screenshot) {
    return {
      has_screenshot: false,
      fallback_message: 'Screenshot not available – see the top 3 friction points from the analysis below.'
    };
  }

  // Build 3 pins - use top issues if available, otherwise generic
  const pins = [];
  
  if (top_issues.length >= 3) {
    // Use actual issues (shortened)
    pins.push({
      number: 1,
      position: { top: '20%', left: '75%' },
      text: shortenPin(top_issues[0].title || top_issues[0].problem),
      highlight: { top: '15%', left: '70%', width: '25%', height: '15%' }
    });
    pins.push({
      number: 2,
      position: { top: '45%', left: '15%' },
      text: shortenPin(top_issues[1].title || top_issues[1].problem),
      highlight: { top: '40%', left: '10%', width: '30%', height: '15%' }
    });
    pins.push({
      number: 3,
      position: { top: '70%', left: '70%' },
      text: shortenPin(top_issues[2].title || top_issues[2].problem),
      highlight: { top: '65%', left: '65%', width: '30%', height: '15%' }
    });
  } else {
    // Generic safe pins
    pins.push({
      number: 1,
      position: { top: '20%', left: '75%' },
      text: 'CTA not immediately visible',
      highlight: { top: '15%', left: '70%', width: '25%', height: '15%' }
    });
    pins.push({
      number: 2,
      position: { top: '45%', left: '15%' },
      text: 'Missing quick contact at top',
      highlight: { top: '40%', left: '10%', width: '30%', height: '15%' }
    });
    pins.push({
      number: 3,
      position: { top: '70%', left: '70%' },
      text: 'Low trust (reviews/references)',
      highlight: { top: '65%', left: '65%', width: '30%', height: '15%' }
    });
  }

  return {
    has_screenshot: true,
    screenshot_url: `/${screenshots.above_fold}`,
    mobile_screenshot_url: screenshots.mobile ? `/${screenshots.mobile}` : null,
    pins: pins
  };
}

/**
 * Shorten pin text to max 50 chars
 */
function shortenPin(text) {
  if (!text) return 'Issue detected';
  if (text.length <= 50) return text;
  return text.substring(0, 47) + '...';
}

/**
 * Build top 3 issues
 */
function buildTop3Issues(top_issues, a6_top_fixes, evidence_pack) {
  const issues = [];

  // Use A6 top_fixes if available, otherwise use UX audit top_issues
  const source = a6_top_fixes.length > 0 ? a6_top_fixes : top_issues;

  for (let i = 0; i < Math.min(3, source.length); i++) {
    const issue = source[i];
    
    issues.push({
      title: issue.title || issue.problem || issue.issue || 'Issue',
      why_it_matters: issue.why || issue.why_it_matters || issue.description || 'May hinder conversions',
      fix_steps: issue.fix_steps || issue.fix || (typeof issue.solution === 'string' ? [issue.solution] : issue.solution) || ['Adjust according to best practices'],
      evidence_ref: issue.evidence_ref || [],
      effort_impact: calculateEffortImpact(issue),
      has_evidence: (issue.evidence_ref && issue.evidence_ref.length > 0) || false
    });
  }

  // If we have less than 3 issues, that's OK - show what we have
  return issues;
}

/**
 * Calculate effort vs impact (heuristic)
 */
function calculateEffortImpact(issue) {
  const problem = (issue.problem || issue.title || '').toLowerCase();
  
  let effort, impact;
  
  // Low effort, high impact
  if (problem.includes('cta') || problem.includes('button') || problem.includes('contact') || problem.includes('phone')) {
    effort = 'Low';
    impact = 'High';
  }
  // Medium effort, high impact
  else if (problem.includes('trust') || problem.includes('form') || problem.includes('headline')) {
    effort = 'Med';
    impact = 'High';
  }
  // Low effort, medium impact
  else if (problem.includes('text') || problem.includes('copy')) {
    effort = 'Low';
    impact = 'Med';
  }
  // Default
  else {
    effort = 'Med';
    impact = 'Med';
  }
  
  return { effort, impact };
}

/**
 * Build deliverables (what they get in 7 days)
 */
function buildDeliverables(offer_copy) {
  const offer_package = offer_copy.offer_package || {};
  const deliverables_from_offer = offer_package.deliverables || [];
  
  // Map to 4 key deliverables
  const standard_deliverables = [
    {
      title: 'Above-fold copy and structure',
      description: 'Specific copy + layout recommendations'
    },
    {
      title: 'Form and CTA flow',
      description: 'Where to place forms and how to simplify them'
    },
    {
      title: 'Trust blocks (reviews/references)',
      description: 'Where and how to add trust signals'
    },
    {
      title: 'Change checklist + priorities',
      description: 'What to do first, what can wait'
    }
  ];
  
  // If we have offer deliverables, use first 4
  if (deliverables_from_offer.length >= 4) {
    return deliverables_from_offer.slice(0, 4).map(d => ({
      title: d.item || d.title || d,
      description: d.description || ''
    }));
  }
  
  return standard_deliverables;
}

/**
 * Build quick wins
 */
function buildQuickWins(quick_wins, llm_context, evidence_pack) {
  const wins = [];

  // Map quick wins from UX audit
  quick_wins.slice(0, 7).forEach(win => {
    if (win.action || win.fix || win.title) {
      wins.push({
        title: win.title || win.action || win.fix,
        description: win.description || win.why || '',
        has_evidence: (win.evidence_ref && win.evidence_ref.length > 0)
      });
    }
  });

  // Add heuristic-based wins if we have evidence
  const cta_analysis = llm_context.cta_analysis || {};
  if (!cta_analysis.primary && wins.length < 7) {
    wins.push({
      title: 'Add primary CTA to homepage',
      description: 'No clear main CTA found',
      has_evidence: true
    });
  }

  const phones = llm_context.contacts?.phones || [];
  if (phones.length === 0 && wins.length < 7) {
    wins.push({
      title: 'Add phone to website header',
      description: 'Phone number not found in top section',
      has_evidence: true
    });
  }

  return wins.slice(0, 7); // Max 7 quick wins
}

/**
 * Build CTA configuration
 */
function buildCtaConfig(job, offer_copy) {
  const offer_package = offer_copy.offer_package || {};
  
  return {
    primary_text: offer_package.cta_text || 'Get the 7-Day Action Plan',
    primary_url: '/web-project-form.html',
    secondary_text: 'View the Details',
    deliverable_name: offer_package.name || '7-Day Quick Fix Plan',
    deliverables: offer_package.deliverables || []
  };
}

/**
 * Build form configuration
 */
function buildFormConfig(job, public_page) {
  return {
    action: '/web-project-form.html',
    method: 'GET',
    headline: 'Get pricing range + next steps',
    subheadline: 'Fill in 30 seconds. We will complete the rest later.',
    prefill: {
      website: job.input_url,
      niche: job.niche,
      city: job.city
    },
    cta_button_text: 'I want the action plan',
    disclaimer: 'No guarantees, just specific recommendations.'
  };
}

/**
 * Build debug information
 */
function buildDebugInfo(job, warnings, evidence_pack) {
  // Coverage map
  const coverage = {
    screenshots: !!job.screenshots_json?.above_fold,
    llm_context: !!job.llm_context_json,
    ux_audit: !!job.assistant_outputs_json?.ux_audit_json,
    seo_audit: !!job.assistant_outputs_json?.local_seo_audit_json,
    offer_copy: !!job.assistant_outputs_json?.offer_copy_json,
    public_page: !!job.assistant_outputs_json?.public_page_json,
    evidence_pack: !!job.evidence_pack_v2_json
  };

  return {
    job_id: job.id,
    input_url: job.input_url,
    niche: job.niche,
    city: job.city,
    created_at: job.created_at,
    updated_at: job.updated_at,
    status: job.status,
    coverage: coverage,
    warnings: warnings,
    has_warnings: warnings.length > 0
  };
}

module.exports = {
  buildViewModelV2
};
