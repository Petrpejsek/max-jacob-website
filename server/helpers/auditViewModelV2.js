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

const { buildDashboardMetrics } = require('./dashboardMetrics');

function safeStr(val) {
  if (val == null) return '';
  if (typeof val === 'string') return cleanObjectObject(val);
  if (typeof val === 'number' || typeof val === 'boolean') return cleanObjectObject(String(val));
  if (typeof val === 'object') {
    const picked = val.text || val.title || val.value || val.description || val.message || JSON.stringify(val);
    return cleanObjectObject(String(picked || ''));
  }
  return cleanObjectObject(String(val));
}

function cleanObjectObject(s) {
  let out = String(s || '');
  if (!out) return '';
  if (!out.includes('[object Object]')) return out;

  // Remove common "Label: [object Object]" artifacts caused by accidental string concatenation.
  out = out.replace(/\s*:\s*\[object Object\]\s*/g, '');
  out = out.replace(/\[object Object\]/g, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}
const {
  normalizeCompanyNameCandidate,
  isLikelyBusinessName,
  deriveDomainFallbackName,
} = require('./companyName');

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
  const data_quality_warnings = job.data_quality_warnings_json || [];
  const public_page = job.public_page_json || {};

  // Extract UX audit data (A2)
  const ux_audit = assistant_outputs.ux_audit_json || {};
  const top_issues = ux_audit.top_issues || [];
  const quick_wins = ux_audit.quick_wins || [];

  // Extract SEO audit data (A3)
  const seo_audit = assistant_outputs.local_seo_audit_json || {};

  // Extract offer data (A4)
  const offer_copy = assistant_outputs.offer_copy_json || {};

  // Extract A6 public page data if available
  const a6_hero = public_page.hero || {};
  const a6_findings = public_page.findings_section?.findings || [];
  // A6 generates findings, not top_3_fixes - use findings directly
  const a6_top_fixes = a6_findings; // Fixed mapping

  // Backlog: more granular + longer list of improvements
  const improvement_backlog = buildImprovementBacklog(job, llm_context, ux_audit, seo_audit);

  const seo_local = buildSeoLocal(job, llm_context, seo_audit);
  const scoreboard = buildScoreboard(llm_context, evidence_pack, ux_audit, seo_audit);
  // Use pre-generated health_snapshot only if it's the current algorithm version.
  // This lets us improve scoring logic without forcing DB migrations for old audits.
  const storedHealth = public_page.health_snapshot || null;
  const health_snapshot =
    (storedHealth && storedHealth.version === 'health_snapshot_v2' && Array.isArray(storedHealth.metrics))
      ? storedHealth
      : buildHealthSnapshot(job, llm_context, ux_audit, seo_audit, seo_local, scoreboard);

  // Build base view model first
  const baseViewModel = {
    // Hero section
    hero: buildHero(job, a6_hero, llm_context),

    // Mini audit (Verified strengths vs booking blockers)
    mini_audit: buildMiniAudit(job, llm_context, ux_audit, top_issues, data_quality_warnings),

    // Growth chart visualization
    growth_chart: buildGrowthChart(llm_context, ux_audit),

    // SEO & Local Search Analysis
    seo_local,

    // Backlog of improvements (Critical / Warning / Opportunity)
    improvement_backlog,

    // Scoreboard (friction/trust/clarity)
    scoreboard,

    // Professional, personalized progress bars (SEO / GEO / Content / Trust / Conversion)
    health_snapshot,

    // Aha moment (screenshot + callouts)
    aha_moment: buildAhaMoment(screenshots, top_issues, job),

    // Top 3 issues (main conversion section)
    top_3_issues: buildTop3Issues(top_issues, a6_top_fixes, evidence_pack, job, llm_context),

    // 7-Day Sprint Plan (day-by-day timeline)
    seven_day_plan: buildSevenDayPlan(job, llm_context, offer_copy, ux_audit, seo_audit),

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

  // Add unified dashboard metrics (eliminates duplications)
  const dashboardMetrics = buildDashboardMetrics(baseViewModel);
  
  return {
    ...baseViewModel,
    dashboard_metrics: dashboardMetrics
  };
}

/**
 * Build hero section with dynamic, personalized copy
 */
function buildHero(job, a6_hero, llm_context) {
  const rawCompanyName = llm_context.company_profile?.name || job.company_name || null;
  const normalizedCompanyName = normalizeCompanyNameCandidate(rawCompanyName);
  const company_name = (normalizedCompanyName && isLikelyBusinessName(normalizedCompanyName))
    ? normalizedCompanyName
    : null;

  let display_name = company_name;
  
  if (!display_name && job.input_url) {
    display_name = deriveDomainFallbackName(job.input_url);
    if (!display_name) {
      try {
        display_name = new URL(job.input_url).hostname.replace('www.', '');
      } catch (e) {
        display_name = job.input_url;
      }
    }
  }
  
  // NO FALLBACKS - niche is required
  if (!job.niche || job.niche.trim() === '') {
    throw new Error('Cannot generate audit view model without niche - niche must be set before running audit');
  }
  const niche = job.niche;
  // City is optional - use 'your area' as fallback for display
  const city = (job.city && job.city.trim()) ? job.city.trim() : 'your area';
  
  // Prefer assistant-provided hero copy, but keep a strong, transformational fallback.
  const defaultHeadline = `Grow bigger online. More leads, more bookings.`;
  const defaultSubheadline =
    `We rebuild your website in 7 days into a lead magnet that books more calls — mobile-first, trust-heavy, and AI/SEO-ready.`;

  // Generate compelling, personalized headline with strong migration for legacy copy
  let headline = a6_hero.headline || defaultHeadline;
  if (typeof headline === 'string' && /(quick\s+wins|quick\s+fixes|we\s+found|quick\s+improvements)/i.test(headline)) {
    headline = defaultHeadline; // migrate legacy framing on older audits
  }

  // Generate subheadline with specifics and strong migration
  let subheadline = a6_hero.subheadline || defaultSubheadline;
  if (typeof subheadline === 'string' && /(quick\s+wins|quick\s+fixes|we\s+found|quick\s+improvements)/i.test(subheadline)) {
    subheadline = defaultSubheadline; // migrate legacy framing on older audits
  }
  // Migrate older default copy to the new positioning
  if (typeof subheadline === 'string' && /conversion-focused\s+websites|ai\s+follow-up|smart\s+automation/i.test(subheadline)) {
    subheadline = defaultSubheadline;
  }

  return {
    headline: headline,
    subheadline: subheadline,
    bullets: [
      `Conversion-first concept for ${display_name}`,
      'AI follow-up system so leads get a fast response',
      'A 7-day ship plan (priorities + scope)'
    ],
    primary_cta_text: 'Get your site preview in 48h',
    secondary_cta_text: 'See a sample preview',
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
  const city = job.city; // validated in buildHero()
  const niche = job.niche; // validated in buildHero()

  // Prefer assistants v1 A3 output shape; fall back if legacy fields exist
  const geoScore =
    (seo_audit && seo_audit.geo_ready_score && Number.isFinite(seo_audit.geo_ready_score.score))
      ? seo_audit.geo_ready_score.score
      : (Number.isFinite(seo_audit.seo_score) ? seo_audit.seo_score : 0);

  const critical_issues = [];

  // Always include AI visibility framing (but no % / #1 claims)
  critical_issues.push({
    issue: 'Invisible to AI Search (ChatGPT, Gemini, Perplexity)',
    impact: `When customers ask AI "best ${niche} in ${city}", you may not appear`,
    fix: 'Add clear service + location content and structured data to improve AI understanding',
    severity: 'critical',
    category: 'ai_visibility'
  });

  // Map NAP issues from A3
  const napIssues = (seo_audit && seo_audit.nap_audit && Array.isArray(seo_audit.nap_audit.issues))
    ? seo_audit.nap_audit.issues
    : [];
  napIssues.slice(0, 3).forEach((it) => {
    const problem = it.problem || it.title || 'NAP issue detected';
    critical_issues.push({
      issue: problem,
      impact: it.impact || 'Hurts local search visibility and customer trust',
      fix: it.fix || 'Fix NAP completeness and consistency across the site',
      severity: 'high',
      category: 'nap'
    });
  });

  // Schema markup issue from A3
  const localBiz = seo_audit && seo_audit.schema_markup && seo_audit.schema_markup.local_business
    ? seo_audit.schema_markup.local_business
    : null;
  if (localBiz && localBiz.present === false) {
    critical_issues.push({
      issue: 'Missing LocalBusiness schema markup',
      impact: 'Search engines and AI have less structured context about your business',
      fix: 'Add LocalBusiness JSON-LD schema with telephone, address, and opening hours',
      severity: 'high',
      category: 'schema'
    });
  }

  // Local signals from A3
  const cityMentions = seo_audit && seo_audit.local_signals && seo_audit.local_signals.city_mentions
    ? seo_audit.local_signals.city_mentions
    : null;
  if (cityMentions && Number.isFinite(cityMentions.count) && cityMentions.count === 0) {
    critical_issues.push({
      issue: 'City not mentioned clearly in key page content',
      impact: `Google and AI may not strongly associate you with ${city}`,
      fix: cityMentions.recommendation || `Add "${city}" to H1, title, and first paragraph`,
      severity: 'high',
      category: 'geo'
    });
  }

  const serviceArea = seo_audit && seo_audit.local_signals && seo_audit.local_signals.service_area
    ? seo_audit.local_signals.service_area
    : null;
  if (serviceArea && serviceArea.detected === false) {
    critical_issues.push({
      issue: 'No defined service area / coverage',
      impact: 'Local customers may not know if you serve their location',
      fix: serviceArea.recommendation || 'Add a clear service area section (cities/regions) on the homepage',
      severity: 'medium',
      category: 'geo'
    });
  }

  // Opportunities (keep generic but avoid guarantees/%/#1)
  const opportunities = [
    {
      opportunity: 'AI Search Optimization (ChatGPT, Gemini)',
      benefit: 'Increase your chance of being recommended in AI answers',
      action: 'Add structured data, authoritative content, and citations',
      category: 'ai_visibility'
    },
    {
      opportunity: 'Google Business Profile Optimization',
      benefit: 'Improve map pack visibility and trust',
      action: 'Verify and optimize your Google Business Profile'
    }
  ];

  return {
    seo_score: geoScore,
    has_issues: critical_issues.length > 0,
    critical_issues: critical_issues.slice(0, 8),
    opportunities: opportunities.slice(0, 3),
    meta_title: '',
    meta_description: '',
    service_areas: [],
    indexability_status: 'unknown'
  };
}

function canonicalizeIssueKey(text) {
  return String(text || '')
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

function normalizeBacklogSeverity(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'critical' || s === 'blocker') return 'critical';
  if (s === 'high') return 'critical';
  if (s === 'medium' || s === 'warning') return 'warning';
  if (s === 'low' || s === 'info' || s === 'opportunity') return 'opportunity';
  return 'warning';
}

function buildImprovementBacklog(job, llm_context, ux_audit, seo_audit) {
  const city = job.city;
  const niche = job.niche;

  const items = [];
  const seen = new Set();

  function pushItem({ title, impact, fix, severity, category, source }) {
    const t = (title || '').toString().trim();
    if (!t) return;

    const key = canonicalizeIssueKey(t);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({
      title: t,
      impact: (impact || '').toString().trim() || 'Reduces clarity, trust, or visibility for local customers',
      fix: (fix || '').toString().trim() || 'We can implement a clean, structured fix in the 7-day sprint',
      severity: normalizeBacklogSeverity(severity),
      category: category || 'general',
      source: source || 'unknown'
    });
  }

  // Always include AI visibility (future-proofing)
  pushItem({
    title: 'Invisible to AI Search (ChatGPT, Gemini, Perplexity)',
    impact: `When customers ask AI "best ${niche} in ${city}", you may not appear`,
    fix: 'Add clear service + location content and structured data to improve AI understanding',
    severity: 'critical',
    category: 'ai_visibility',
    source: 'system'
  });

  // --- SEO audit (A3) ---
  const napIssues = (seo_audit && seo_audit.nap_audit && Array.isArray(seo_audit.nap_audit.issues))
    ? seo_audit.nap_audit.issues
    : [];
  napIssues.forEach((it) => {
    pushItem({
      title: it.problem || it.title || 'NAP issue detected',
      impact: it.impact || 'Hurts local search visibility and customer trust',
      fix: it.fix || 'Fix NAP completeness and consistency across the site',
      severity: it.severity || 'high',
      category: 'nap',
      source: 'local_seo_audit_json.nap_audit'
    });
  });

  const localBiz = seo_audit && seo_audit.schema_markup && seo_audit.schema_markup.local_business
    ? seo_audit.schema_markup.local_business
    : null;
  if (localBiz && localBiz.present === false) {
    pushItem({
      title: 'Missing LocalBusiness schema markup',
      impact: 'Search engines and AI have less structured context about your business',
      fix: 'Add LocalBusiness JSON-LD schema with telephone, address, and opening hours',
      severity: 'high',
      category: 'schema',
      source: 'local_seo_audit_json.schema_markup'
    });
  }

  const cityMentions = seo_audit && seo_audit.local_signals && seo_audit.local_signals.city_mentions
    ? seo_audit.local_signals.city_mentions
    : null;
  if (cityMentions && Number.isFinite(cityMentions.count) && cityMentions.count === 0) {
    pushItem({
      title: 'City not mentioned clearly in key page content',
      impact: `Google and AI may not strongly associate you with ${city}`,
      fix: cityMentions.recommendation || `Add "${city}" to H1, title, and first paragraph`,
      severity: 'high',
      category: 'geo',
      source: 'local_seo_audit_json.local_signals'
    });
  } else if (cityMentions && Number.isFinite(cityMentions.count) && cityMentions.count > 0 && cityMentions.count < 3) {
    pushItem({
      title: 'Weak city/location signals across the site',
      impact: `You may not be recognized as a top ${niche} option in ${city}`,
      fix: cityMentions.recommendation || `Add "${city}" to above-the-fold copy + service sections`,
      severity: 'medium',
      category: 'geo',
      source: 'local_seo_audit_json.local_signals'
    });
  }

  const serviceArea = seo_audit && seo_audit.local_signals && seo_audit.local_signals.service_area
    ? seo_audit.local_signals.service_area
    : null;
  if (serviceArea && serviceArea.detected === false) {
    pushItem({
      title: 'No defined service area / coverage',
      impact: 'Local customers may not know if you serve their location',
      fix: serviceArea.recommendation || 'Add a clear service area section (cities/regions) on the homepage',
      severity: 'medium',
      category: 'geo',
      source: 'local_seo_audit_json.local_signals'
    });
  }

  const factors = (seo_audit && seo_audit.geo_ready_score && Array.isArray(seo_audit.geo_ready_score.factors))
    ? seo_audit.geo_ready_score.factors
    : [];
  factors.forEach((f) => {
    if (!f || !f.factor) return;
    const points = Number.isFinite(f.points) ? f.points : null;
    const earned = Number.isFinite(f.earned) ? f.earned : null;
    if (points != null && earned != null && earned < points) {
      pushItem({
        title: `Local SEO gap: ${f.factor}`,
        impact: `Reduces your chance to appear for "${niche} ${city}" searches (Google + AI)`,
        fix: 'We’ll implement a clean, structured fix (content + structured data + placement)',
        severity: (points - earned) >= 10 ? 'medium' : 'low',
        category: 'geo',
        source: 'local_seo_audit_json.geo_ready_score'
      });
    }
  });

  // --- UX audit (A2) ---
  const topIssues = (ux_audit && Array.isArray(ux_audit.top_issues)) ? ux_audit.top_issues : [];
  topIssues.forEach((it) => {
    const title = safeStr(it.title) || safeStr(it.problem) || safeStr(it.issue);
    const impact = safeStr(it.impact) || safeStr(it.why_it_matters) || 'Causes visitors to hesitate or leave without contacting you';
    const fixRaw = (Array.isArray(it.fix_steps) && it.fix_steps[0]) ? it.fix_steps[0] : (it.fix || it.recommendation || 'Rewrite key sections for clarity + add a single dominant CTA');
    const fix = safeStr(fixRaw);
    pushItem({
      title,
      impact,
      fix,
      severity: it.severity || 'medium',
      category: 'ux',
      source: 'ux_audit_json.top_issues'
    });
  });

  const quickWins = (ux_audit && Array.isArray(ux_audit.quick_wins)) ? ux_audit.quick_wins : [];
  quickWins.forEach((w) => {
    if (!w) return;
    pushItem({
      title: typeof w === 'string' ? w : (safeStr(w.title) || safeStr(w.problem) || 'Quick improvement'),
      impact: 'Improves clarity, trust, or conversion flow for local customers',
      fix: typeof w === 'string' ? w : (safeStr(w.fix) || safeStr(w.recommendation) || 'Implement this improvement in the sprint'),
      severity: 'low',
      category: 'ux',
      source: 'ux_audit_json.quick_wins'
    });
  });

  // --- Lightweight evidence-based heuristics (from llm_context) ---
  const trustEvidence = Array.isArray(llm_context.trust_evidence) ? llm_context.trust_evidence : [];
  if (trustEvidence.length < 2) {
    pushItem({
      title: 'Not enough proof/trust signals above the fold',
      impact: 'Visitors don’t see reasons to choose you quickly, so they keep shopping',
      fix: 'Add reviews, license/insured badges, guarantees, and strong before/after proof near the primary CTA',
      severity: 'medium',
      category: 'trust',
      source: 'llm_context.trust_evidence'
    });
  }

  const cta = llm_context.cta_analysis || {};
  if (!cta.primary) {
    pushItem({
      title: 'Primary call-to-action is unclear or not dominant',
      impact: 'Visitors don’t know what to do next, so they bounce or delay contacting you',
      fix: 'Make one primary CTA dominant (Call / Request Quote) and repeat it in key scroll points',
      severity: 'medium',
      category: 'conversion',
      source: 'llm_context.cta_analysis'
    });
  }

  const phones = Array.isArray(llm_context.company_profile?.phones) ? llm_context.company_profile.phones : [];
  if (phones.length === 0) {
    pushItem({
      title: 'Phone number not clearly detectable',
      impact: 'High-intent visitors can’t call immediately (lost quick bookings)',
      fix: 'Add a click-to-call phone CTA in header + above fold + contact section',
      severity: 'high',
      category: 'conversion',
      source: 'llm_context.company_profile'
    });
  }

  const hours = llm_context.company_profile?.opening_hours || llm_context.company_profile?.hours;
  if (!hours) {
    pushItem({
      title: 'Business hours are missing or hard to find',
      impact: 'Reduces trust and can hurt local visibility signals',
      fix: 'Add business hours on site (footer + contact) and include it in LocalBusiness schema',
      severity: 'medium',
      category: 'nap',
      source: 'llm_context.company_profile'
    });
  }

  // Group
  const critical = [];
  const warnings = [];
  const opportunities = [];
  items.forEach((it) => {
    if (it.severity === 'critical') critical.push(it);
    else if (it.severity === 'warning') warnings.push(it);
    else opportunities.push(it);
  });

  // Put AI visibility first in critical list
  critical.sort((a, b) => (b.category === 'ai_visibility') - (a.category === 'ai_visibility'));

  const counts = {
    critical: critical.length,
    warning: warnings.length,
    opportunity: opportunities.length,
    total: items.length
  };

  return {
    counts,
    critical: critical.slice(0, 6),
    warnings: warnings.slice(0, 9),
    opportunities: opportunities.slice(0, 12)
  };
}

/**
 * Build mini audit section (Existing Assets vs Friction Killers)
 */
function buildMiniAudit(job, llm_context, ux_audit, top_issues, data_quality_warnings = []) {
  const well = [];
  const unclear = [];

  const company = llm_context.company_profile || {};
  const services = llm_context.services || {};
  const cta = llm_context.cta_analysis || {};
  const friction = llm_context.contact_friction || {};
  const trust = Array.isArray(llm_context.trust_evidence) ? llm_context.trust_evidence : [];
  const quality = Array.isArray(llm_context.quality_warnings) ? llm_context.quality_warnings : [];

  const phones = Array.isArray(company.phones) ? company.phones.filter(Boolean) : [];
  const emails = Array.isArray(company.emails) ? company.emails.filter(Boolean) : [];
  const social = Array.isArray(company.social_links) ? company.social_links.filter(Boolean) : [];
  const featuredServices = Array.isArray(services.featured) ? services.featured : [];
  const allCtas = Array.isArray(cta.all_ctas) ? cta.all_ctas : [];

  const address = company.address || {};
  const hasAnyAddress = Boolean(address && (address.street || address.city || address.region || address.postal || address.country));

  const fmtPhones = phones.slice(0, 2).join(', ');
  const fmtEmails = emails.slice(0, 2).join(', ');
  const fmtAddress = hasAnyAddress
    ? [address.street, address.city, address.region, address.postal, address.country].filter(Boolean).join(', ')
    : null;
  const fmtHours = (company.hours && (company.hours.opens || company.hours.closes || (company.hours.days && company.hours.days.length)))
    ? `${(company.hours.days && company.hours.days.length) ? company.hours.days.join(', ') : 'Hours'} ${company.hours.opens || ''}${(company.hours.opens && company.hours.closes) ? '–' : ''}${company.hours.closes || ''}`.trim()
    : null;
  const fmtServices = featuredServices
    .map(s => (typeof s === 'string' ? s : (s.title || s.name)))
    .filter(Boolean)
    .slice(0, 4);
  const fmtCtas = allCtas.map(x => x && x.text).filter(Boolean).slice(0, 4);

  const trustTypes = new Set(trust.map(t => t && t.type).filter(Boolean));
  const hasReview = trustTypes.has('review_snippet') || trustTypes.has('testimonial') || trustTypes.has('review');
  const hasCert = trustTypes.has('certification') || trustTypes.has('badge');
  const hasYears = trustTypes.has('years_in_business');

  // --- VERIFIED STRENGTHS (make each line obviously about THEIR site) ---
  if (company.name) {
    well.push({
      title: 'Business name detected',
      detail: `Found: ${company.name}`
    });
  }

  if (phones.length > 0 || emails.length > 0) {
    well.push({
      title: 'Contact channels detected',
      detail: `${phones.length ? `Phone: ${fmtPhones}` : 'Phone: not detected'}${emails.length ? ` • Email: ${fmtEmails}` : ''}`
    });
  }

  if (cta.primary && cta.primary.text) {
    const intent = cta.primary.intent ? String(cta.primary.intent) : 'unknown intent';
    const location = cta.primary.location ? String(cta.primary.location) : 'unknown location';
    well.push({
      title: 'Primary CTA detected',
      detail: `"${cta.primary.text}" (${intent}, ${location})`
    });
  } else if (fmtCtas.length > 0) {
    well.push({
      title: 'CTAs detected (no single dominant one)',
      detail: `Found: ${fmtCtas.map(t => `"${t}"`).join(', ')}`
    });
  }

  if (fmtServices.length > 0) {
    well.push({
      title: 'Services detected',
      detail: `Found: ${fmtServices.join(', ')}`
    });
  }

  if (fmtAddress || company.address?.city || job.city) {
    well.push({
      title: 'Local footprint detected',
      detail: fmtAddress ? `Address: ${fmtAddress}` : `City signal: ${company.address?.city || job.city}`
    });
  }

  if (fmtHours) {
    well.push({
      title: 'Business hours detected',
      detail: fmtHours
    });
  }

  if (hasReview || hasCert || hasYears) {
    const proof = [];
    if (hasReview) proof.push('reviews');
    if (hasCert) proof.push('badges/certifications');
    if (hasYears) proof.push('years in business');
    well.push({
      title: 'Trust proof detected',
      detail: `Found: ${proof.join(', ')}`
    });
  }

  if (social.length > 0) {
    well.push({
      title: 'Social profiles detected',
      detail: social.slice(0, 2).join(' • ')
    });
  }

  // Graceful degradation: if we can't prove positives, say so explicitly.
  if (well.length === 0) {
    well.push({
      title: 'Limited data detected',
      detail: 'We could not confidently verify strengths from the available scrape. This usually means key info is missing or blocked from crawling.'
    });
  }

  // --- BOOKING BLOCKERS (detected or missing) ---
  // Contact friction (phone/header/click-to-call/clicks)
  if (phones.length === 0) {
    unclear.push({
      title: 'Phone number not detected',
      detail: 'High-intent visitors often want to call immediately. If the number isn’t visible (or isn’t crawlable), you lose urgent jobs.'
    });
  } else if (friction.phone_in_header === false) {
    unclear.push({
      title: 'Phone number not visible in header',
      detail: `Detected phone: ${fmtPhones} — but it doesn’t appear in the header (urgent calls become friction).`
    });
  }

  if (friction.phone_clickable === false && phones.length > 0) {
    unclear.push({
      title: 'Phone is not click-to-call on mobile',
      detail: `Make ${phones[0]} a tappable \`tel:\` link so mobile users can call instantly.`
    });
  }

  if (Number.isFinite(friction.clicks_to_contact) && friction.clicks_to_contact > 1) {
    unclear.push({
      title: 'Too many clicks to contact you',
      detail: `We detected ~${friction.clicks_to_contact} clicks to reach contact. For local service, aim for 1 click from above the fold.`
    });
  }

  if (friction.form_detected === false) {
    unclear.push({
      title: 'No request form detected',
      detail: 'You’re missing a low-friction path for “not ready to call” visitors (quote / booking / contact form).'
    });
  }

  // CTA clarity
  if (!cta.primary) {
    unclear.push({
      title: 'No dominant primary CTA detected',
      detail: fmtCtas.length ? `CTAs found: ${fmtCtas.map(t => `"${t}"`).join(', ')} — but none is clearly the primary action.` : 'We could not verify a clear primary CTA from the scrape.'
    });
  }

  // Trust
  if (!hasReview && !hasCert && !hasYears) {
    unclear.push({
      title: 'Trust proof is weak or missing',
      detail: 'We did not detect reviews, certifications/badges, or “years in business” proof near key decision points.'
    });
  }

  // Local SEO basics (NAP fields)
  const missingAddressParts = [];
  if (!address.street) missingAddressParts.push('street');
  if (!address.city) missingAddressParts.push('city');
  if (!address.region) missingAddressParts.push('region');
  if (!address.postal) missingAddressParts.push('postal');
  if (!address.country) missingAddressParts.push('country');
  if (hasAnyAddress && missingAddressParts.length > 0) {
    unclear.push({
      title: 'Address is incomplete for local visibility',
      detail: `Missing: ${missingAddressParts.join(', ')} (this weakens Local SEO + AI understanding).`
    });
  } else if (!hasAnyAddress) {
    unclear.push({
      title: 'Address / service location not clearly detected',
      detail: 'Local customers (and Google/AI) need a clear service location or service area to trust and match you to the right city.'
    });
  }

  if (!fmtHours) {
    unclear.push({
      title: 'Business hours not detected',
      detail: 'Hours are a trust and Local SEO signal. Add hours on the site and in LocalBusiness schema.'
    });
  }

  // Bring in a few specific UX issues (already evidence-based)
  const issues = Array.isArray(top_issues) ? top_issues : [];
  issues.slice(0, 3).forEach((issue) => {
    const title = issue.title || issue.problem || issue.issue;
    const why = issue.why_it_matters || issue.why || issue.description;
    if (!title) return;
    unclear.push({
      title: title,
      detail: why ? String(why) : 'A verified UX issue that can reduce bookings.'
    });
  });

  // If we still have very little, surface explicit unknowns rather than throwing.
  if (unclear.length < 4) {
    const dq = Array.isArray(data_quality_warnings) ? data_quality_warnings : [];
    const firstMsg = dq.find(w => w && w.message) ? dq.find(w => w && w.message).message : null;
    const q = quality.find(w => w && w.message) ? quality.find(w => w && w.message).message : null;
    unclear.push({
      title: 'Some audit signals could not be verified',
      detail: firstMsg || q || 'The scrape did not expose enough structured signals to verify more issues reliably.'
    });
  }

  const dedupeBullets = (arr) => {
    const out = [];
    const seenTitles = new Set();
    (Array.isArray(arr) ? arr : []).forEach((b) => {
      if (!b) return;
      const title = b.title || b.text || '';
      const key = canonicalizeIssueKey(title);
      if (!key) return;
      if (seenTitles.has(key)) return;
      seenTitles.add(key);
      out.push(b);
    });
    return out;
  };

  const wellFinal = dedupeBullets(well);
  const unclearFinal = dedupeBullets(unclear);

  return {
    well: wellFinal.slice(0, 6),
    unclear: unclearFinal.slice(0, 8)
  };
}

/**
 * Build growth chart data
 */
function buildGrowthChart(llm_context, ux_audit) {
  const ux_score = deriveUxScore(ux_audit);
  
  // Calculate current impact (based on UX score)
  const current_impact = Math.max(20, Math.min(40, ux_score / 2.5));
  
  // Potential is always higher (80-95%)
  const potential_impact = 90;
  
  return {
    current_impact: Math.round(current_impact),
    potential_impact: potential_impact,
    gap_score: clamp01To100(potential_impact - current_impact),
    stats: {
      capture_time: '3s',
      wont_return: '88%'
    }
  };
}

function deriveUxScore(ux_audit) {
  if (ux_audit && Number.isFinite(ux_audit.ux_score)) {
    return Math.max(0, Math.min(100, ux_audit.ux_score));
  }

  const issues = (ux_audit && Array.isArray(ux_audit.top_issues)) ? ux_audit.top_issues : [];
  if (issues.length === 0) return 60;

  let score = 90;
  issues.slice(0, 5).forEach((it) => {
    const sev = String(it.severity || '').toLowerCase();
    if (sev === 'high') score -= 18;
    else if (sev === 'medium') score -= 10;
    else if (sev === 'low') score -= 6;
    else score -= 8;
  });
  return Math.max(10, Math.min(95, Math.round(score)));
}

/**
 * Build 7-day sprint plan
 */
function buildSevenDayPlan(job, llm_context, offer_copy, ux_audit, seo_audit) {
  const city = job.city;
  const niche = job.niche;
  const company = llm_context.company_profile || {};
  const primaryCta = llm_context.cta_analysis?.primary?.text || null;

  const hasSchemaGap = Boolean(seo_audit?.schema_markup?.local_business?.present === false);
  const hasNapIssues = Boolean(seo_audit?.nap_audit?.issues && Array.isArray(seo_audit.nap_audit.issues) && seo_audit.nap_audit.issues.length > 0);

  // Pull a couple high-impact issues to reference in the plan (still generic-safe).
  const issues = (ux_audit && Array.isArray(ux_audit.top_issues)) ? ux_audit.top_issues : [];
  const issueTitles = issues
    .map((it) => it && (it.problem || it.title || it.issue))
    .filter(Boolean)
    .slice(0, 2);

  const whatWeFixLine = issueTitles.length
    ? `We prioritize the biggest blockers we detected: ${issueTitles.map(t => `"${cleanIssueTitle(t)}"`).join(' + ')}.`
    : 'We prioritize the biggest booking blockers we detected from the scrape.';

  const ctaLine = primaryCta
    ? `We'll align everything around one dominant CTA ("${primaryCta}") and remove competing actions near the top.`
    : "We'll define one dominant CTA (Call / Request Service) and make it the obvious next step.";

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
 * Build scoreboard (friction, trust, clarity)
 */
function buildScoreboard(llm_context, evidence_pack, ux_audit, seo_audit) {
  return {
    friction: calculateFriction(llm_context, ux_audit),
    trust: calculateTrust(llm_context, evidence_pack),
    clarity: calculateClarity(llm_context, seo_audit)
  };
}

function clamp01To100(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Apply reality adjustment to LLM scores (corrects optimism bias)
 * @param {number} score - Raw score from LLM assistant
 * @param {Array} penalties - Array of penalty objects: {condition: boolean, value: number}
 * @returns {number} - Adjusted score (0-100)
 */
function applyRealityAdjustment(score, penalties = []) {
  if (!Number.isFinite(score)) return 0;
  
  let adjusted = score;
  
  // Base optimism correction - LLMs tend to be very generous.
  // We want green to be rare (90+ only for truly top sites).
  adjusted = adjusted * 0.75;

  // Extra harshness for "pretty good" scores that are often inflated
  if (score >= 80) adjusted -= 6;
  
  // Apply specific penalties for missing critical elements
  penalties.forEach(p => {
    if (p.condition) {
      adjusted -= p.value;
    }
  });
  
  return clamp01To100(adjusted);
}

function statusFromScore(score) {
  // Recalibrated thresholds (more realistic distribution)
  // Expected: red ~30%, yellow ~50%, green ~20%
  if (score < 35) return 'critical';  // Bottom 30%
  if (score < 65) return 'warning';   // Middle 50%
  return 'good';                       // Top 20% only
}

function classesFromStatus(status) {
  if (status === 'good') {
    return { text: 'text-emerald-600', bar: 'bg-emerald-500' };
  }
  if (status === 'warning') {
    return { text: 'text-amber-600', bar: 'bg-amber-500' };
  }
  return { text: 'text-red-600', bar: 'bg-red-500' };
}

function scoreFromLevel(level, map) {
  const l = String(level || '').toLowerCase().trim();
  if (map[l] != null) return map[l];
  return 55;
}

function computeGeoSignalsScore(seo_audit) {
  // Prefer factor-weighted score if present (more explainable)
  const factors = (seo_audit && seo_audit.geo_ready_score && Array.isArray(seo_audit.geo_ready_score.factors))
    ? seo_audit.geo_ready_score.factors
    : [];
  if (factors.length > 0) {
    let totalPoints = 0;
    let earnedPoints = 0;
    factors.forEach((f) => {
      if (!f) return;
      const p = Number.isFinite(f.points) ? f.points : null;
      const e = Number.isFinite(f.earned) ? f.earned : null;
      if (p == null || e == null) return;
      totalPoints += p;
      earnedPoints += e;
    });
    if (totalPoints > 0) return clamp01To100((earnedPoints / totalPoints) * 100);
  }

  const score =
    (seo_audit && seo_audit.geo_ready_score && Number.isFinite(seo_audit.geo_ready_score.score))
      ? seo_audit.geo_ready_score.score
      : 0;
  return clamp01To100(score);
}

function buildHealthSnapshot(job, llm_context, ux_audit, seo_audit, seo_local, scoreboard) {
  const city = job.city;
  const niche = job.niche;

  const uxScore = deriveUxScore(ux_audit);
  
  // Apply reality tax to SEO scores (LLM optimism correction)
  const rawLocalSeoScore = seo_local && Number.isFinite(seo_local.seo_score) ? seo_local.seo_score : 0;
  const localSeoScore = applyRealityAdjustment(rawLocalSeoScore, []);
  
  // GEO signals: apply manual penalties for missing critical elements
  const cityMentionsCountRaw = seo_audit?.local_signals?.city_mentions?.count;
  const cityMentionsCount = Number.isFinite(cityMentionsCountRaw) ? cityMentionsCountRaw : null;
  const hasLocalBusinessSchema = seo_audit?.schema_markup?.local_business?.present === true;
  const hasServiceArea = seo_audit?.local_signals?.service_area?.detected === true;
  
  const rawGeoScore = computeGeoSignalsScore(seo_audit);
  // IMPORTANT: Don't change legacy (LLM) audits unexpectedly.
  // For template-generated audits we avoid double-penalizing factor-based GEO scores
  // (it can drive real-but-low audits to 0% and looks empty/untrustworthy).
  // For legacy audits we keep the previous behavior to preserve existing production outputs.
  const hasGeoFactors =
    (seo_audit && seo_audit.geo_ready_score && Array.isArray(seo_audit.geo_ready_score.factors) && seo_audit.geo_ready_score.factors.length > 0);
  const processingMethod = (job && job.processing_method) ? String(job.processing_method) : '';
  const isTemplateAudit = processingMethod.startsWith('template_engine_');

  const geoSignalsScore = (isTemplateAudit && hasGeoFactors)
    ? applyRealityAdjustment(rawGeoScore, [])
    : applyRealityAdjustment(rawGeoScore, [
        { condition: cityMentionsCount !== null && cityMentionsCount < 3, value: 18 },
        { condition: cityMentionsCount === 0, value: 10 }, // Extra penalty for zero mentions
        { condition: !hasLocalBusinessSchema, value: 12 },
        { condition: !hasServiceArea, value: 10 }
      ]);

  // RECALIBRATED trust score mapping: strong=70, ok=50, weak=25
  const trustScore = clamp01To100(scoreFromLevel(scoreboard.trust.level, { strong: 70, ok: 50, weak: 25 }));
  const clarityScore = clamp01To100(scoreFromLevel(scoreboard.clarity.level, { strong: 70, ok: 55, weak: 30 }));

  // RECALIBRATED conversion: lower base (25 instead of 35)
  const frictionPenalty = scoreFromLevel(scoreboard.friction.level, { low: 0, medium: 12, high: 25 });
  const conversionScore = clamp01To100((uxScore * 0.65) + (25 - frictionPenalty));

  // Content + Design: be conservative and evidence-based (avoid overly-positive defaults)
  const uxAssistantScores =
    (ux_audit && ux_audit.scores && typeof ux_audit.scores === 'object' && !Array.isArray(ux_audit.scores))
      ? ux_audit.scores
      : {};
  const uxClarity = Number.isFinite(uxAssistantScores.clarity) ? clamp01To100(uxAssistantScores.clarity) : null;
  const uxMobile = Number.isFinite(uxAssistantScores.mobile) ? clamp01To100(uxAssistantScores.mobile) : null;

  const servicesFeatured = Array.isArray(llm_context.services?.featured) ? llm_context.services.featured : [];
  const serviceNames = servicesFeatured
    .map((s) => (typeof s === 'string' ? s : (s && (s.title || s.name))))
    .filter(Boolean);
  const servicesCount = serviceNames.length;

  // Content score: use verifiable site structure + depth (avoid mixing in CTA/contact/trust)
  const rawDump =
    (job && job.raw_dump_json && typeof job.raw_dump_json === 'object' && !Array.isArray(job.raw_dump_json))
      ? job.raw_dump_json
      : {};
  const rawPages = Array.isArray(rawDump.pages) ? rawDump.pages : [];

  const siteSnapshot =
    (job && job.site_snapshot_json && typeof job.site_snapshot_json === 'object' && !Array.isArray(job.site_snapshot_json))
      ? job.site_snapshot_json
      : {};
  const pagesIndex = Array.isArray(siteSnapshot.pages_index) ? siteSnapshot.pages_index : [];

  const pageTypes = new Set(
    [
      ...rawPages.map(p => p && p.page_type).filter(Boolean),
      ...pagesIndex.map(p => p && p.page_type).filter(Boolean)
    ].map(t => String(t))
  );
  const hasType = (t) => pageTypes.has(String(t));

  // Crawl page_type patterns don't catch many real-world URLs (e.g. "/orlando-plumbing-contact.html").
  // For content scoring, augment with lightweight token-based detection from URLs + titles.
  const tokenize = (value) =>
    String(value || '')
      .toLowerCase()
      .split(/[^a-z]+/g)
      .filter(Boolean);

  const tokensForPage = (p) => {
    const urlRaw = (p && (p.url || p.page_url)) ? String(p.url || p.page_url) : '';
    const titleRaw = (p && p.title) ? String(p.title) : '';
    let urlTokens = [];
    try {
      const u = new URL(urlRaw);
      urlTokens = tokenize(u.pathname);
    } catch {
      urlTokens = tokenize(urlRaw);
    }
    const titleTokens = tokenize(titleRaw);
    return new Set([...urlTokens, ...titleTokens]);
  };

  const hasAny = (tokens, candidates) => (candidates || []).some(w => tokens.has(String(w)));

  const nicheKey = String(niche || '').toLowerCase().trim();
  const serviceTopicTokensByNiche = {
    plumbing: ['plumbing', 'plumber', 'drain', 'sewer', 'leak', 'toilet', 'faucet', 'pipe', 'piping', 'water', 'heater', 'sump'],
    roofing: ['roof', 'roofing', 'roofer', 'shingle', 'shingles', 'gutter', 'gutters', 'leak', 'repair', 'replacement'],
    hvac: ['hvac', 'heating', 'cooling', 'air', 'conditioning', 'ac', 'furnace', 'heat', 'duct', 'ducts'],
    electrician: ['electric', 'electrical', 'electrician', 'wiring', 'panel', 'breaker', 'outlet', 'lighting', 'generator']
  };
  const serviceTopicTokens = serviceTopicTokensByNiche[nicheKey] || [];
  const serviceActionTokens = ['services', 'service', 'residential', 'commercial', 'emergency', 'repair', 'installation', 'maintenance', 'cleaning', 'replacement', 'inspection', 'remodeling'];
  const nonContentTokens = ['contact', 'privacy', 'terms', 'login', 'admin', 'sitemap'];

  const detected = { services: false, about: false, locations: false, faq: false, pricing: false, blog: false, gallery: false };
  const pagesForScan = pagesIndex.length > 0 ? pagesIndex : rawPages;
  let bestServicesWords = null;

  pagesForScan.forEach((p) => {
    if (!p) return;
    const tokens = tokensForPage(p);
    const wc = Number.isFinite(p.word_count) ? p.word_count : 0;

    const isAbout = hasAny(tokens, ['about', 'team', 'company', 'story']);
    const isFaq = hasAny(tokens, ['faq', 'questions', 'question']);
    const isPricing = hasAny(tokens, ['pricing', 'prices', 'price', 'cost', 'rates', 'rate']);
    const isBlog = hasAny(tokens, ['blog', 'news', 'articles', 'article']);
    const isGallery = hasAny(tokens, ['gallery', 'projects', 'portfolio', 'work']);
    const isLocations =
      hasAny(tokens, ['locations', 'location']) ||
      (tokens.has('areas') && tokens.has('served')) ||
      (tokens.has('service') && tokens.has('area')) ||
      tokens.has('areas-served');

    if (isAbout) detected.about = true;
    if (isFaq) detected.faq = true;
    if (isPricing) detected.pricing = true;
    if (isBlog) detected.blog = true;
    if (isGallery) detected.gallery = true;
    if (isLocations) detected.locations = true;

    const looksNonContent = hasAny(tokens, nonContentTokens);

    const isServicesByType = (p.page_type && String(p.page_type) === 'services');
    const isServicesByTokens = tokens.has('services') || tokens.has('service') || tokens.has('offerings');
    const isServicesByTopic =
      !looksNonContent &&
      !isAbout && !isFaq && !isPricing && !isBlog && !isGallery &&
      wc >= 200 &&
      (hasAny(tokens, serviceActionTokens) || hasAny(tokens, serviceTopicTokens));

    if (isServicesByType || isServicesByTokens || isServicesByTopic) {
      detected.services = true;
      if (Number.isFinite(p.word_count)) {
        bestServicesWords = (bestServicesWords == null) ? p.word_count : Math.max(bestServicesWords, p.word_count);
      }
    }
  });

  const hasKey = {
    services: hasType('services') || detected.services,
    about: hasType('about') || detected.about,
    locations: hasType('locations') || detected.locations,
    faq: hasType('faq') || detected.faq,
    pricing: hasType('pricing') || detected.pricing,
    blog: hasType('blog') || detected.blog,
    gallery: hasType('gallery') || detected.gallery
  };

  const pickRawPage = (t) => rawPages.find(p => p && p.page_type === t) || null;
  const homeRaw = pickRawPage('home') || rawPages[0] || null;

  const homeWords = Number.isFinite(homeRaw?.word_count) ? homeRaw.word_count : null;
  const servicesWords = bestServicesWords;

  const scoreHomeWords = (() => {
    if (homeWords == null) return 8; // unknown: conservative baseline
    if (homeWords < 180) return 5;
    if (homeWords < 350) return 10;
    if (homeWords < 600) return 14;
    if (homeWords < 900) return 17;
    return 20;
  })();

  const scoreServicesWords = (() => {
    if (!hasKey.services) return 0;
    if (servicesWords == null) return 5; // services page exists but not in raw_dump slice
    if (servicesWords < 120) return 2;
    if (servicesWords < 250) return 6;
    if (servicesWords < 450) return 10;
    if (servicesWords < 800) return 13;
    return 15;
  })();

  const pagesForDepth = pagesIndex.length > 0 ? pagesIndex : rawPages;
  const richPagesCount = pagesForDepth.filter((p) => {
    if (!p) return false;
    const t = p.page_type ? String(p.page_type) : '';
    if (!t || t === 'home' || t === 'contact') return false;
    // If crawler mislabels contact/legal as "other", exclude via tokens.
    const tokens = tokensForPage(p);
    if (hasAny(tokens, nonContentTokens)) return false;
    const wc = Number.isFinite(p.word_count) ? p.word_count : 0;
    return wc >= 350;
  }).length;
  const richPagesPoints = Math.min(5, richPagesCount);

  // Coverage: do they have key informational pages?
  let coveragePoints = 0;
  if (hasKey.services) coveragePoints += 18;
  if (hasKey.about) coveragePoints += 8;
  if (hasKey.locations) coveragePoints += 8;
  if (hasKey.faq) coveragePoints += 4;
  if (hasKey.pricing) coveragePoints += 4;
  if (hasKey.blog) coveragePoints += 4;
  if (hasKey.gallery) coveragePoints += 4;
  coveragePoints = Math.min(40, coveragePoints);

  // Note: We intentionally do NOT add "city mentions" / "service list size" into the Content score
  // because those signals already influence GEO/Local SEO, and tend to inflate Content unrealistically.

  // Penalize thin/duplicate pages when we have enough crawl data (v3 path)
  let contentPenalty = 0;
  let dupRatio = null;
  let thinRatio = null;
  if (pagesIndex.length >= 10) {
    const hashes = pagesIndex.map(p => p && p.content_hash).filter(Boolean);
    if (hashes.length >= 10) {
      const unique = new Set(hashes).size;
      dupRatio = 1 - (unique / hashes.length);
      if (dupRatio > 0.25) {
        // 0.25 => 0 penalty, 0.75 => 12 penalty
        contentPenalty += Math.round(Math.min(12, (dupRatio - 0.25) * 24));
      }
    }
    const wcs = pagesIndex.map(p => (p && Number.isFinite(p.word_count)) ? p.word_count : null).filter(w => w != null);
    if (wcs.length >= 10) {
      const thinCount = wcs.filter(w => w < 180).length;
      thinRatio = thinCount / wcs.length;
      if (thinRatio > 0.5) {
        // 0.50 => 0 penalty, 1.00 => 10 penalty
        contentPenalty += Math.round(Math.min(10, (thinRatio - 0.5) * 20));
      }
    }
  }
  contentPenalty = Math.min(18, contentPenalty);

  const contentScoreBase =
    coveragePoints +
    scoreHomeWords +
    scoreServicesWords +
    richPagesPoints;
  const contentScore = clamp01To100(Math.round(contentScoreBase - contentPenalty));

  // RECALIBRATED Design score: lower default (35 instead of 48), apply reality tax to UX scores
  const designDefault = 35; // Lower baseline to create urgency
  const mobileIssuesCount = Array.isArray(ux_audit?.mobile_issues) ? ux_audit.mobile_issues.length : 0;
  let designScore = designDefault;
  if (uxMobile != null || uxClarity != null) {
    // Apply reality tax to UX assistant scores (they tend to be optimistic)
    const baseMobile = uxMobile != null ? applyRealityAdjustment(uxMobile, []) : (uxClarity != null ? applyRealityAdjustment(uxClarity, []) : designDefault);
    const baseClarity = uxClarity != null ? applyRealityAdjustment(uxClarity, []) : baseMobile;
    const base = Math.round((baseMobile * 0.60) + (baseClarity * 0.40));
    const penalty = Math.min(18, mobileIssuesCount * 6);
    designScore = clamp01To100(base - penalty);
  }

  const compact = (s, max) => {
    const t = String(s || '').trim();
    if (!t) return null;
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
  };

  const contentNoteParts = [];
  if (homeWords != null) contentNoteParts.push(`Home: ~${homeWords} words`);
  else contentNoteParts.push('Home: word count unknown');
  if (hasKey.services && servicesWords != null) contentNoteParts.push(`Services content: ~${servicesWords} words`);
  else if (hasKey.services) contentNoteParts.push('Services content detected');

  const keyLabels = {
    services: 'Services',
    about: 'About',
    locations: 'Service area',
    faq: 'FAQ',
    pricing: 'Pricing',
    blog: 'Blog',
    gallery: 'Gallery'
  };
  const keyOrder = ['services', 'about', 'locations', 'faq', 'pricing', 'blog', 'gallery'];
  const keyFound = keyOrder.filter(t => hasKey[t]).map(t => keyLabels[t] || t);
  contentNoteParts.push(keyFound.length ? `Key pages: ${keyFound.join(', ')}` : 'Key pages: none detected');

  if (servicesCount > 0) {
    contentNoteParts.push(`Services detected: ${servicesCount}`);
  } else {
    contentNoteParts.push('Services detected: none');
  }
  if (pagesIndex.length > 0) contentNoteParts.push(`Pages crawled: ${pagesIndex.length}`);
  if (dupRatio != null) contentNoteParts.push(`Duplicate pages: ${Math.round(dupRatio * 100)}%`);

  const contentNote = contentNoteParts.join(' • ');

  const designNoteParts = [];
  if (uxMobile != null) designNoteParts.push(`UX mobile: ${uxMobile}/100`);
  if (uxClarity != null) designNoteParts.push(`UX clarity: ${uxClarity}/100`);
  if (mobileIssuesCount > 0) designNoteParts.push(`Mobile issues: ${mobileIssuesCount}`);
  const designNote = designNoteParts.length ? designNoteParts.join(' • ') : 'Default baseline (no UX signals available)';

  const metricsRaw = [
    { key: 'local_seo', label: 'Local SEO', score: localSeoScore, note: `How visible you are for "${niche} ${city}" searches` },
    { key: 'geo', label: `GEO Signals (${city})`, score: geoSignalsScore, note: 'City + service-area signals that Google/AI can understand' },
    { key: 'content', label: 'Content', score: contentScore, note: contentNote },
    { key: 'design', label: 'Design', score: designScore, note: designNote },
    { key: 'trust', label: 'Trust', score: trustScore, note: 'Proof: reviews, badges, credentials, and credibility' },
    { key: 'conversion', label: 'Conversion Path', score: conversionScore, note: 'How frictionless it is to call / request a quote' }
  ];

  const metrics = metricsRaw.map((m) => {
    const status = statusFromScore(m.score);
    const classes = classesFromStatus(status);
    return {
      ...m,
      status,
      text_class: classes.text,
      bar_class: classes.bar
    };
  });

  return {
    version: 'health_snapshot_v2',
    title: `Personalized snapshot for ${job.input_url || 'your site'}`,
    metrics
  };
}

/**
 * Calculate lead friction score
 */
function calculateFriction(llm_context, ux_audit) {
  const cta_analysis = llm_context.cta_analysis || {};
  const has_primary_cta = !!cta_analysis.primary;
  const has_forms = !!llm_context.contact_friction?.form_detected;
  const has_contact =
    (llm_context.company_profile?.phones || []).length > 0 ||
    (llm_context.company_profile?.emails || []).length > 0;
  const ux_score = deriveUxScore(ux_audit);

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
 * Recalibrated for realistic distribution: strong needs 3+ pieces + prominence
 */
function calculateTrust(llm_context, evidence_pack) {
  const trust_evidence = llm_context.trust_evidence || [];
  const reviews_found = trust_evidence.some(t => t.type === 'review' || t.type === 'testimonial');
  const certifications_found = trust_evidence.some(t => t.type === 'certification' || t.type === 'badge');
  const references_found = trust_evidence.some(t => t.type === 'reference' || t.type === 'portfolio');

  let level, explanation, evidence;

  const trust_count = [reviews_found, certifications_found, references_found].filter(Boolean).length;

  // RECALIBRATED: Strong requires 3+ pieces (top 10% sites only)
  if (trust_count >= 3) {
    level = 'strong';
    explanation = 'Multiple trust signals present';
    evidence = [];
    if (reviews_found) evidence.push('Reviews or testimonials found');
    if (certifications_found) evidence.push('Certifications or badges found');
    if (references_found) evidence.push('References or portfolio found');
  } else if (trust_count >= 2) {
    // 2 pieces = OK (not strong anymore)
    level = 'ok';
    explanation = 'Basic trust signals present, but could be stronger';
    evidence = [];
    if (reviews_found) evidence.push('Reviews found');
    if (certifications_found) evidence.push('Certifications found');
    if (references_found) evidence.push('References found');
  } else if (trust_count === 1) {
    level = 'ok';
    explanation = 'Minimal trust signals detected';
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
  const has_service_area = !!llm_context.company_profile?.address?.city;
  const has_contact_info = !!((llm_context.company_profile?.phones || []).length || (llm_context.company_profile?.emails || []).length);
  const seo_score =
    (seo_audit && seo_audit.geo_ready_score && Number.isFinite(seo_audit.geo_ready_score.score))
      ? seo_audit.geo_ready_score.score
      : (Number.isFinite(seo_audit.seo_score) ? seo_audit.seo_score : 0);

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
    mobile_screenshot_url: (screenshots.mobile_above_fold || screenshots.mobile) ? `/${screenshots.mobile_above_fold || screenshots.mobile}` : null,
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
function cleanIssueTitle(title) {
  if (!title) return 'Issue detected';
  return String(title)
    .replace(/^(opportunity|issue|problem)\s*:\s*/i, '')
    .trim();
}

function isGenericFixLine(s) {
  const t = String(s || '').toLowerCase();
  return t.includes('unable to verify a concrete fix') || t.includes('unable to verify');
}

function buildPersonalizedFixSteps(issue, job, llm_context) {
  const titleRaw = issue.title || issue.problem || issue.issue || '';
  const title = String(titleRaw).toLowerCase();
  const city = job.city;
  const niche = job.niche;
  const phones = Array.isArray(llm_context.company_profile?.phones) ? llm_context.company_profile.phones.filter(Boolean) : [];
  const emails = Array.isArray(llm_context.company_profile?.emails) ? llm_context.company_profile.emails.filter(Boolean) : [];
  const phone = phones[0] || null;
  const ctaPrimary = llm_context.cta_analysis?.primary?.text || null;
  const allCtas = Array.isArray(llm_context.cta_analysis?.all_ctas) ? llm_context.cta_analysis.all_ctas.map(x => x && x.text).filter(Boolean) : [];
  const trust = Array.isArray(llm_context.trust_evidence) ? llm_context.trust_evidence : [];
  const hasReviews = trust.some(t => (t && (t.type === 'review_snippet' || t.type === 'review' || t.type === 'testimonial')));
  const hasYears = trust.some(t => t && t.type === 'years_in_business');
  const hasBadges = trust.some(t => t && (t.type === 'certification' || t.type === 'badge'));

  // Phone / urgent calls
  if (title.includes('phone') || title.includes('call') || title.includes('urgent')) {
    const steps = [];
    if (phone) {
      steps.push(`Add a click-to-call phone CTA in the header (tel:) using ${phone}`);
      steps.push('Make it sticky on mobile so it stays visible while scrolling');
    } else {
      steps.push('Add a click-to-call phone CTA in the header (tel:) (phone not detected in scrape)');
      steps.push('Repeat the phone CTA above the fold and in the footer/contact section');
    }
    steps.push(`Pair it with one clear action label for ${city} visitors (e.g., "Call for ${niche} service")`);
    return steps;
  }

  // Trust / reviews
  if (title.includes('trust') || title.includes('review') || title.includes('testimonial') || title.includes('credib')) {
    const steps = [];
    if (hasReviews) {
      steps.push('Move your strongest review snippet above the fold near the primary CTA');
    } else {
      steps.push('Add a reviews block above the fold (we did not detect reviews in the scrape)');
    }
    if (hasYears) steps.push('Add your “years in business” proof next to the headline/CTA');
    if (hasBadges) steps.push('Place license/insured/certification badges near the CTA (not buried in footer)');
    if (!hasYears && !hasBadges) steps.push('Add 2–3 credibility signals (license/insured, years, local proof) next to the CTA');
    return steps.slice(0, 3);
  }

  // CTA clarity
  if (title.includes('cta') || title.includes('call-to-action') || title.includes('call to action') || title.includes('contact')) {
    const steps = [];
    if (ctaPrimary) {
      steps.push(`Make "${ctaPrimary}" the single dominant CTA above the fold (remove competing CTAs nearby)`);
    } else if (allCtas.length > 0) {
      steps.push(`CTAs detected: ${allCtas.slice(0, 3).map(t => `"${t}"`).join(', ')} — choose ONE as primary and make it dominant`);
    } else {
      steps.push('No clear CTA detected — add ONE dominant CTA above the fold (Call / Request service)');
    }
    steps.push('Repeat the same CTA at 2–3 scroll points (hero, mid-page, footer)');
    steps.push('Match CTA text to intent (call vs quote vs schedule) and keep it consistent site-wide');
    return steps;
  }

  // Generic fallback (still personalized by niche/city)
  return [
    `Rewrite the above-the-fold message for ${niche} customers in ${city} (what you do + where + why you)`,
    `Add one dominant CTA (call/quote) and place it next to the headline`,
    `Add trust proof (reviews/badges/years) right next to the CTA`
  ];
}

function buildTop3Issues(top_issues, a6_top_fixes, evidence_pack, job, llm_context) {
  const issues = [];

  const uxIssues = Array.isArray(top_issues) ? top_issues : [];
  const a6Issues = Array.isArray(a6_top_fixes) ? a6_top_fixes : [];

  // Use A6 findings if available, otherwise use UX audit top_issues
  const source = a6Issues.length > 0 ? a6Issues : uxIssues;
  
  // Graceful degradation: allow empty list (template shows "analysis in progress")
  if (source.length === 0) {
    return issues;
  }

  const tokens = (text) => {
    const k = canonicalizeIssueKey(text);
    return k ? k.split(' ').filter(Boolean) : [];
  };

  const jaccard = (aTokens, bTokens) => {
    if (!aTokens.length || !bTokens.length) return 0;
    const a = new Set(aTokens);
    const b = new Set(bTokens);
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  };

  const dedupeLines = (arr, max = null) => {
    const out = [];
    const seen = new Set();
    (Array.isArray(arr) ? arr : []).forEach((raw) => {
      if (raw == null) return;
      const s = String(raw).trim();
      if (!s) return;
      const key = canonicalizeIssueKey(s);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    });
    return max != null ? out.slice(0, max) : out;
  };

  const findClosestUxIssue = (titleText) => {
    if (!uxIssues.length) return null;
    const titleTokens = tokens(titleText);
    if (!titleTokens.length) return null;
    let best = null;
    let bestScore = 0;
    for (const u of uxIssues) {
      const uTitle = cleanIssueTitle(u.title || u.problem || u.issue || '');
      const score = jaccard(titleTokens, tokens(uTitle));
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return bestScore >= 0.55 ? best : null;
  };

  const seenTitles = [];

  for (let i = 0; i < source.length && issues.length < 3; i++) {
    const issue = source[i];

    const title = cleanIssueTitle(issue.title || issue.problem || issue.issue || 'Issue detected');
    const titleKey = canonicalizeIssueKey(title);
    if (!titleKey) continue;

    // Skip near-duplicates among the top-3 (keeps the section diverse)
    const titleTokens = tokens(title);
    const isNearDup = seenTitles.some((prevTokens) => jaccard(titleTokens, prevTokens) >= 0.90);
    if (isNearDup) continue;
    seenTitles.push(titleTokens);

    // If A6 finding is used, try to enrich it with A2 (UX) fix_steps/evidence_ref
    const uxMatch = findClosestUxIssue(title);

    const why = issue.why || issue.why_it_matters || issue.description || 'Impacts user experience';

    // Extract fix_steps - can be array or string, convert to array
    const extractFixSteps = (src) => {
      if (!src) return null;
      if (src.fix_steps && Array.isArray(src.fix_steps)) return src.fix_steps;
      if (src.fix && typeof src.fix === 'string') return src.fix.includes('\n') ? src.fix.split('\n').filter(Boolean) : [src.fix];
      if (src.solution) return typeof src.solution === 'string' ? [src.solution] : src.solution;
      return null;
    };

    let fix_steps = extractFixSteps(issue);
    if ((!fix_steps || fix_steps.length === 0) && uxMatch) {
      fix_steps = extractFixSteps(uxMatch);
    }
    if (!fix_steps || fix_steps.length === 0) {
      fix_steps = ['Unable to verify a concrete fix from the available data.'];
    }

    const computedFixSteps = buildPersonalizedFixSteps(uxMatch || issue, job, llm_context);

    // Prefer assistant-provided fix steps, but never show the generic "Unable to verify..." line.
    const safeFixSteps = dedupeLines(fix_steps, 6);
    const fixStepsFinal = (safeFixSteps.length > 0 && !isGenericFixLine(safeFixSteps[0]))
      ? safeFixSteps
      : computedFixSteps;

    const evidence_ref_raw =
      (issue && Array.isArray(issue.evidence_ref) && issue.evidence_ref.length > 0)
        ? issue.evidence_ref
        : (uxMatch && Array.isArray(uxMatch.evidence_ref) ? uxMatch.evidence_ref : []);
    const evidence_ref = dedupeLines(evidence_ref_raw, 12);

    issues.push({
      title,
      why_it_matters: why,
      fix_steps: dedupeLines(fixStepsFinal, 6),
      evidence_ref,
      effort_impact: calculateEffortImpact(issue),
      has_evidence: evidence_ref.length > 0
    });
  }

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
    if (typeof win === 'string' && win.trim()) {
      wins.push({
        title: win.trim().slice(0, 140),
        description: '',
        has_evidence: false
      });
      return;
    }
    if (win.action || win.fix || win.title) {
      wins.push({
        title: safeStr(win.title) || safeStr(win.action) || safeStr(win.fix),
        description: safeStr(win.description) || safeStr(win.why) || '',
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

  const phones = llm_context.company_profile?.phones || [];
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
  // Generate dynamic capacity slots starting from 2 days from now
  const today = new Date();
  const startOffset = 2; // Start showing slots from 2 days from now
  const totalSlots = 20; // Show 20 days (4 rows of 5)
  
  // Generate slots dynamically
  const capacity_slots = [];
  for (let i = 0; i < totalSlots; i++) {
    const slotDate = new Date(today);
    slotDate.setDate(today.getDate() + startOffset + i);
    
    // Format date as YYYY-MM-DD
    const dateString = slotDate.toISOString().split('T')[0];
    
    // Deterministic status based on date (consistent across visits)
    // Use day of month and day of week for pattern
    const dayOfWeek = slotDate.getDay(); // 0-6 (Sunday-Saturday)
    const dayOfMonth = slotDate.getDate(); // 1-31
    
    let status = 'available';
    let slots_left = 3;
    
    // Deterministic pattern (stable over time for same date):
    // - Every 4th day = full (weekdays only to avoid too many)
    // - Tuesday/Friday with odd day = limited
    // - Rest = available
    
    if (dayOfMonth % 5 === 0 && dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Every 5th day of month (not weekend) = full
      status = 'full';
      slots_left = 0;
    } else if (dayOfMonth % 7 === 0) {
      // Every 7th day = full
      status = 'full';
      slots_left = 0;
    } else if ((dayOfWeek === 2 || dayOfWeek === 5) && dayOfMonth % 2 === 1) {
      // Tuesday or Friday with odd day = limited
      status = 'limited';
      slots_left = 1;
    } else if (dayOfWeek === 4 && dayOfMonth % 3 === 0) {
      // Thursday every 3rd day = limited
      status = 'limited';
      slots_left = 1;
    } else {
      // Default available with 2-3 slots
      status = 'available';
      slots_left = dayOfMonth % 2 === 0 ? 2 : 3;
    }
    
    capacity_slots.push({
      date: dateString,
      status: status,
      slots_left: slots_left
    });
  }
  
  // Calculate this week's available slots (next 7 days)
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  
  const this_week_slots = capacity_slots
    .filter(slot => {
      const slotDate = new Date(slot.date);
      return slotDate <= sevenDaysFromNow && slot.status !== 'full';
    })
    .reduce((sum, slot) => sum + slot.slots_left, 0);
  
  // Find earliest available date
  const earliest_available = capacity_slots.find(slot => slot.status !== 'full')?.date || capacity_slots[0]?.date;
  
  return {
    action: '/api/contact-submissions',
    method: 'POST',
    headline: 'I want the 7-Day Website Build (Action Price: $997)',
    subheadline: '<span class="line-through text-slate-400">$1,497</span> <span class="text-blue-600 font-bold">$997</span> (Action price)',
    prefill: {
      website: job.input_url,
      niche: job.niche,
      city: job.city,
      contact_name: job.contact_name || '',
      contact_email: job.contact_email || '',
      contact_phone: job.contact_phone || ''
    },
    cta_button_text: 'Get your site preview in 48h',
    disclaimer: 'No payment now. This form only reserves your request.<br>No strings attached.',
    capacity_slots: capacity_slots,
    this_week_slots: this_week_slots,
    earliest_available: earliest_available
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
