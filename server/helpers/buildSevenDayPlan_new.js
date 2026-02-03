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
    : 'We'll define one dominant CTA (Call / Request Service) and make it the obvious next step.';

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
      promise: 'Calls/forms tracked + instant response so leads don't go cold',
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
