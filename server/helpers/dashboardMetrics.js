/**
 * Dashboard Metrics - Unified Data Source
 * 
 * Centralizes dashboard data to eliminate duplications and inconsistencies.
 * Single source of truth for Quick Wins, Critical Issues, etc.
 */

/**
 * Canonicalize issue title for deduplication
 */
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

/**
 * Dedupe issues by title similarity
 */
function dedupeIssuesByTitle(issues, alreadyShownIssues = []) {
  const seen = new Set();
  const result = [];
  
  // Mark already shown issues as seen
  alreadyShownIssues.forEach(issue => {
    const title = issue.title || issue.problem || issue.issue || '';
    const key = canonicalizeIssueKey(title);
    if (key) seen.add(key);
  });
  
  // Filter out duplicates
  issues.forEach(issue => {
    const title = issue.title || issue.problem || issue.issue || '';
    const key = canonicalizeIssueKey(title);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(issue);
  });
  
  return result;
}

/**
 * Build unified dashboard metrics
 * @param {Object} vm - View model from buildViewModelV2
 * @returns {Object} - Unified metrics for dashboard
 */
function buildDashboardMetrics(vm) {
  // 1. QUICK WINS - Use A2 data (evidence-based), not heuristic filter
  const quickWins = Array.isArray(vm.quick_wins) ? vm.quick_wins : [];
  const quickWinsCount = Math.min(5, quickWins.length);
  
  // 2. CRITICAL ISSUES - Dedupe with top 3
  const allCriticalIssues = (vm.improvement_backlog && Array.isArray(vm.improvement_backlog.critical)) 
    ? vm.improvement_backlog.critical 
    : [];
  const allWarnings = (vm.improvement_backlog && Array.isArray(vm.improvement_backlog.warnings))
    ? vm.improvement_backlog.warnings
    : [];
  const allOpportunities = (vm.improvement_backlog && Array.isArray(vm.improvement_backlog.opportunities))
    ? vm.improvement_backlog.opportunities
    : [];
  
  // Dedupe: remove issues that are already in top 3
  const top3Issues = Array.isArray(vm.top_3_issues) ? vm.top_3_issues : [];
  const dedupedCritical = dedupeIssuesByTitle(allCriticalIssues, top3Issues);
  
  // 3. AI VISIBILITY - Show only once (remove from backlog if in top 3)
  const aiVisibilityInTop3 = top3Issues.some(issue => {
    const title = (issue.title || '').toLowerCase();
    return title.includes('ai search') || title.includes('ai visibility') || title.includes('chatgpt');
  });
  
  let finalCritical = dedupedCritical;
  if (aiVisibilityInTop3) {
    // Remove AI visibility from backlog
    finalCritical = dedupedCritical.filter(issue => {
      const title = (issue.title || '').toLowerCase();
      return !(title.includes('ai search') || title.includes('ai visibility') || title.includes('chatgpt'));
    });
  }
  
  const criticalCount = finalCritical.length;
  const warningCount = allWarnings.length;
  const opportunityCount = allOpportunities.length;
  
  return {
    // Counts
    criticalCount,
    warningCount,
    opportunityCount,
    quickWinsCount,
    totalIssuesCount: criticalCount + warningCount + opportunityCount,
    
    // Deduplicated lists
    criticalIssues: finalCritical,
    warnings: allWarnings,
    opportunities: allOpportunities,
    quickWins: quickWins.slice(0, 5),
    
    // Metadata
    hasAiVisibilityInTop3: aiVisibilityInTop3
  };
}

module.exports = {
  buildDashboardMetrics,
  dedupeIssuesByTitle,
  canonicalizeIssueKey
};
