# Two Founders Section - Quick Reference

## 🎯 Overview

The Two Founders section is now **personalized and data-driven**, pulling real audit data to show concrete proof instead of generic claims.

---

## 📂 Files Modified

| File | Purpose | Location |
|------|---------|----------|
| `auditViewModelV2.js` | Data generation | `server/helpers/auditViewModelV2.js` |
| `audit-public-v2.ejs` | Template/display | `server/views/audit-public-v2.ejs` |

---

## 🔧 Key Functions

### `buildTwoFoundersSection(job, baseViewModel)`

**Location:** `server/helpers/auditViewModelV2.js` (line ~1890)

**Returns:**
```javascript
{
  headline: string,
  personalized_intro: string,
  estimated_impact: string,
  metric_callout: string | null,
  company_name: string,
  city: string,
  niche: string,
  issues_total: number,
  issues_critical: number,
  missed_leads_min: number,
  missed_leads_max: number,
  credibility_chips: Array,
  outcome_bullets: Array,
  primary_cta_text: string,
  secondary_cta_text: string,
  process: string,
  signature: string
}
```

---

## 📊 Data Sources

### Issues Counts
```javascript
baseViewModel.improvement_backlog.counts
├── total: number           // Total issues found
├── critical: number        // Critical issues
├── warning: number         // Warning issues
└── opportunity: number     // Opportunity issues
```

### Health Scores
```javascript
baseViewModel.health_snapshot.metrics[]
├── { key: 'design', score: number }      // Mobile/UX score
├── { key: 'geo', score: number }         // AI/GEO score
├── { key: 'conversion', score: number }  // Conversion score
└── ...
```

### Business Info
```javascript
baseViewModel.hero
├── company_name: string
├── brand_or_domain: string
├── city: string
└── niche: string
```

---

## 🎨 Template Variables

Access in EJS with `vm.two_founders.*`:

```ejs
<!-- Personalized intro -->
<%= vm.two_founders.personalized_intro %>

<!-- Example output: -->
<!-- "We audited Orlando Plumbing Pro in Orlando and found 12 -->
<!-- high-impact issues (4 critical) holding back bookings." -->

<!-- Estimated impact -->
<%= vm.two_founders.estimated_impact %>

<!-- Example: "Estimated missed leads: 20–32/month" -->

<!-- Metric callout (may be null) -->
<% if (vm.two_founders.metric_callout) { %>
  <%= vm.two_founders.metric_callout %>
<% } %>

<!-- Example: "Your current site: 38/100 mobile conversion readiness" -->

<!-- Credibility chips (loop) -->
<% vm.two_founders.credibility_chips.forEach(chip => { %>
  <%= chip.icon %> <%= chip.text %> (<%= chip.detail %>)
<% }); %>

<!-- Outcome bullets (loop) -->
<% vm.two_founders.outcome_bullets.forEach(bullet => { %>
  <li>✓ <%= bullet %></li>
<% }); %>

<!-- Personalized CTAs -->
<%= vm.two_founders.primary_cta_text %>
<!-- Example: "Get Orlando Plumbing Pro's Free Plan" -->

<%= vm.two_founders.secondary_cta_text %>
<!-- Example: "See Your Preview" -->
```

---

## 🔢 Calculations

### Missed Leads Formula

```javascript
const missed_leads_min = Math.max(10, issues_critical * 5);
const missed_leads_max = Math.max(20, issues_critical * 8);
```

**Examples:**
- 0 critical issues → 10-16 leads/month (minimum baseline)
- 3 critical issues → 15-24 leads/month
- 5 critical issues → 25-40 leads/month
- 10 critical issues → 50-80 leads/month

**Logic:** Each critical issue costs ~5-8 leads per month

---

### Metric Callout Priority

```javascript
// 1. Try mobile score first
if (mobile_score !== null) {
  return `Your current site: ${mobile_score}/100 mobile conversion readiness`;
}

// 2. Fallback to AI score
if (ai_score !== null) {
  return `AI visibility: ${ai_score}/100`;
}

// 3. No metric available
return null;  // Box won't render
```

---

## 🎯 Quick Edits

### Change Credibility Chips

**File:** `server/helpers/auditViewModelV2.js`

```javascript
credibility_chips: [
  { icon: '✅', text: '7-Day Sprint', detail: 'fixed scope' },
  { icon: '✅', text: 'No meetings', detail: 'short form only' },
  { icon: '✅', text: 'Pay in 2 parts', detail: 'milestone-based' }
]
```

**To add/modify:**
1. Change text/detail in existing chips
2. Add more chips to array
3. Template will auto-render all

---

### Change Outcome Bullets

**File:** `server/helpers/auditViewModelV2.js`

```javascript
outcome_bullets: [
  `More booked calls with a mobile-first lead magnet (call/text/book)`,
  `Higher trust rate above the fold (reviews + licenses + guarantees)`,
  `More discovery via Google + AI (structured content + GEO signals)`
]
```

**Guidelines:**
- Start with outcome verb ("More", "Higher", "Faster")
- Include benefit + mechanism
- Keep under 80 characters

---

### Change Missed Leads Formula

**File:** `server/helpers/auditViewModelV2.js`

```javascript
// Current (conservative)
const missed_leads_min = Math.max(10, issues_critical * 5);
const missed_leads_max = Math.max(20, issues_critical * 8);

// More aggressive (not recommended)
const missed_leads_min = Math.max(15, issues_critical * 8);
const missed_leads_max = Math.max(30, issues_critical * 12);

// More conservative
const missed_leads_min = Math.max(5, issues_critical * 3);
const missed_leads_max = Math.max(10, issues_critical * 5);
```

---

### Change CTA Text Format

**File:** `server/helpers/auditViewModelV2.js`

```javascript
// Current
primary_cta_text: `Get ${company_name}'s Free Plan`
secondary_cta_text: `See Your Preview`

// Alternative formats
primary_cta_text: `Get My Free 7-Day Plan`
primary_cta_text: `Get ${city} ${niche} Plan`
primary_cta_text: `Yes, Send ${company_name}'s Plan`

secondary_cta_text: `See ${company_name} Preview`
secondary_cta_text: `View Example`
```

---

## 🎨 Styling Reference

### Credibility Chip Classes

```css
flex items-center gap-2 
bg-white/10 backdrop-blur-sm 
rounded-2xl px-4 py-2.5 
border border-white/20
```

**Colors:**
- Background: 10% white with blur
- Border: 20% white
- Text: White (bold) + blue-100 (detail)

---

### Audit Proof Box Classes

```css
bg-white/5 
border border-white/20 
rounded-xl px-4 py-3 
backdrop-blur-sm
```

**Typography:**
- Label: `text-xs font-bold text-blue-200`
- Metric: `text-sm font-black text-white`

---

### Layout Structure

```html
<section class="px-6">
  <div class="max-w-7xl mx-auto">
    <div class="bg-blue-600 rounded-[4rem] p-8 md:p-12">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <!-- LEFT: Photos + Chips -->
        <div class="flex flex-col">
          [Photos]
          [Chips]
          [Metric]
        </div>
        
        <!-- RIGHT: Content -->
        <div class="flex-1 text-center lg:text-left">
          [Headline]
          [Intro]
          [Bullets]
          [CTAs]
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## 🐛 Troubleshooting

### Issue: "two_founders is undefined"

**Check:**
```javascript
// In auditViewModelV2.js, line ~115
return {
  ...baseViewModel,
  dashboard_metrics: dashboardMetrics,
  two_founders: twoFounders  // ← Make sure this exists
};
```

---

### Issue: Data not updating

**Solution:**
```bash
# Restart server
npm restart

# Or regenerate specific audit
# (if data is cached)
```

---

### Issue: Metric callout always null

**Check:**
```javascript
// In buildTwoFoundersSection()
const mobile_score = baseViewModel.health_snapshot?.metrics
  ?.find(m => m.key === 'design')?.score || null;

const ai_score = baseViewModel.health_snapshot?.metrics
  ?.find(m => m.key === 'geo')?.score || null;

console.log('mobile_score:', mobile_score);
console.log('ai_score:', ai_score);
```

**Expected:** At least one should be a number (0-100)

---

### Issue: Bullets still showing old text

**Check template:**
```ejs
<!-- OLD (wrong): -->
<span>Build a mobile-first lead magnet</span>

<!-- NEW (correct): -->
<span><%= bullet %></span>

<!-- With loop: -->
<% vm.two_founders.outcome_bullets.forEach(bullet => { %>
  <li><span><%= bullet %></span></li>
<% }); %>
```

---

## 📋 Checklist for Changes

When modifying this section:

- [ ] Update view model function if changing data
- [ ] Update template if changing layout
- [ ] Test with real audit data
- [ ] Verify personalization works
- [ ] Check mobile layout
- [ ] Test graceful degradation
- [ ] Verify no console errors
- [ ] Update documentation if needed

---

## 🚀 Deployment Notes

### Before deploying:

1. **Test locally** with 3+ different audits
2. **Check console** for errors
3. **Verify mobile** layout on real device
4. **Confirm data sources** are correct

### After deploying:

1. **Spot check** 3-5 production audits
2. **Verify personalization** is working
3. **Check error logs** for any issues
4. **Monitor user feedback**

---

## 📚 Related Documentation

- `TWO_FOUNDERS_PERSONALIZED_COMPLETE.md` - Full implementation details
- `TWO_FOUNDERS_VISUAL_COMPARISON.md` - Before/after visual guide
- `TWO_FOUNDERS_TESTING_GUIDE.md` - Testing procedures

---

## 💡 Tips

1. **Keep it evidence-based**: Only show metrics you have data for
2. **Be conservative**: Better to underestimate than overpromise
3. **Test edge cases**: Zero issues, missing names, null scores
4. **Mobile-first**: Most users will see this on mobile
5. **Keep bullets short**: <80 characters for readability

---

## 🔗 Quick Links

**Edit data:**
→ `server/helpers/auditViewModelV2.js` line ~1890

**Edit template:**
→ `server/views/audit-public-v2.ejs` line ~1254

**View in browser:**
→ `/audit/[audit_id]` (scroll to Two Founders section)

---

## ✅ Success Metrics

This section is working if:

1. ✅ Every audit shows unique, business-specific data
2. ✅ No generic "your site" language
3. ✅ Real issue counts displayed
4. ✅ Missed leads estimate shown
5. ✅ CTAs include business name
6. ✅ Metric callout shows (when data available)
7. ✅ Zero console errors
8. ✅ Mobile layout works perfectly

**Goal:** "This was clearly made for MY business" (not a template)
