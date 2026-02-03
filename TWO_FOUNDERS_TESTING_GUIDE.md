# Two Founders Section - Testing & Verification Guide

## 🧪 Testing Checklist

Use this guide to verify the personalized Two Founders section is working correctly.

---

## 1️⃣ Quick Visual Test

### Open any audit dashboard and scroll to the "Two Founders" section

**Expected:** Blue rounded card with 2-column layout

### LEFT COLUMN:
- [ ] Max's photo (rounded, with white border)
- [ ] Jacob's photo (rounded, with white border)
- [ ] 3 credibility chips below photos:
  - [ ] "✅ 7-Day Sprint (fixed scope)"
  - [ ] "✅ No meetings (short form only)"
  - [ ] "✅ Pay in 2 parts (milestone-based)"
- [ ] 1 audit proof metric box (if data available):
  - [ ] Shows either "Your current site: X/100 mobile conversion readiness"
  - [ ] OR "AI visibility: X/100"

### RIGHT COLUMN:
- [ ] Headline: "Real help. Two founders. No agency runaround."
- [ ] Personalized intro with business name and city
- [ ] "Estimated missed leads: X–Y/month" line
- [ ] 3 outcome-focused bullets (starting with "More...", "Higher...", "More...")
- [ ] Process line: "Short form → we build..."
- [ ] Signature: "— Max & Jacob (founders)"
- [ ] 2 CTAs with personalized text

---

## 2️⃣ Personalization Test

### Test Case 1: Full Data Available

**Setup:**
- Audit with complete data
- Business name: "Orlando Plumbing Pro"
- City: "Orlando"
- Issues: 12 total, 4 critical
- Mobile score: 38/100

**Expected Output:**

```
We audited Orlando Plumbing Pro in Orlando and found 12 high-impact 
issues (4 critical) holding back bookings.

Estimated missed leads: 20–32/month

[Audit Proof box]
Your current site: 38/100 mobile conversion readiness
```

**CTA should say:**
```
Get Orlando Plumbing Pro's Free Plan
```

---

### Test Case 2: No Mobile Score (Fallback to AI)

**Setup:**
- Mobile score: null
- AI score: 42/100

**Expected:**

```
[Audit Proof box]
AI visibility: 42/100
```

---

### Test Case 3: No Scores Available

**Setup:**
- Mobile score: null
- AI score: null

**Expected:**
- Audit Proof box should NOT render (graceful degradation)
- Section still displays with all other elements

---

### Test Case 4: Zero Issues

**Setup:**
- Issues total: 0
- Issues critical: 0

**Expected:**

```
We audited Orlando Plumbing Pro in Orlando and found 0 high-impact 
issues (0 critical) holding back bookings.

Estimated missed leads: 10–16/month
```

**Note:** Even with 0 issues, system uses minimum of 10-16 leads (conservative baseline)

---

## 3️⃣ Data Source Verification

### Check that data flows from audit to view model:

**In browser console (on audit page):**
```javascript
// Check if data is present
console.log(vm.two_founders);
```

**Expected output:**
```javascript
{
  headline: "Real help. Two founders. No agency runaround.",
  personalized_intro: "We audited Orlando Plumbing Pro in Orlando...",
  estimated_impact: "Estimated missed leads: 20–32/month",
  metric_callout: "Your current site: 38/100 mobile conversion readiness",
  company_name: "Orlando Plumbing Pro",
  city: "Orlando",
  niche: "plumbing",
  issues_total: 12,
  issues_critical: 4,
  missed_leads_min: 20,
  missed_leads_max: 32,
  credibility_chips: [...],
  outcome_bullets: [...],
  primary_cta_text: "Get Orlando Plumbing Pro's Free Plan",
  secondary_cta_text: "See Your Preview"
}
```

---

## 4️⃣ Responsive Test

### Desktop (≥1024px)
- [ ] 2-column layout (photos left, content right)
- [ ] Photos side-by-side horizontally
- [ ] Credibility chips stack vertically
- [ ] Text aligned left

### Tablet (768px - 1023px)
- [ ] Still 2-column but narrower spacing
- [ ] Photos slightly smaller
- [ ] Text still readable

### Mobile (<768px)
- [ ] Single column (stacked)
- [ ] Photos centered, side-by-side
- [ ] Chips stack below photos
- [ ] Content centered below
- [ ] CTAs stack vertically

---

## 5️⃣ Text Content Verification

### Check for Generic Language ❌

**Should NOT appear:**
- ❌ "We reviewed your site"
- ❌ "Build a mobile-first lead magnet"
- ❌ "Fix the trust + conversion flow"
- ❌ "Get My Free Plan"
- ❌ "See Preview Example"

### Should Appear ✅

**Personalization:**
- ✅ "We audited {BusinessName} in {City}"
- ✅ "found {X} high-impact issues"
- ✅ "({Y} critical)"
- ✅ "Estimated missed leads: {min}–{max}/month"

**Outcome Bullets:**
- ✅ "More booked calls with a mobile-first lead magnet"
- ✅ "Higher trust rate above the fold"
- ✅ "More discovery via Google + AI"

**CTAs:**
- ✅ "Get {BusinessName}'s Free Plan"
- ✅ "See Your Preview"

---

## 6️⃣ Styling Verification

### Credibility Chips
- [ ] Semi-transparent white background (`bg-white/10`)
- [ ] White border (`border-white/20`)
- [ ] Rounded corners (`rounded-2xl`)
- [ ] Icon + bold text + lighter detail text

**CSS Classes:**
```html
bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-2.5 
border border-white/20
```

### Audit Proof Box
- [ ] Slightly darker background (`bg-white/5`)
- [ ] White border (`border-white/20`)
- [ ] Smaller rounded corners (`rounded-xl`)
- [ ] Label in blue-200, metric in white

**CSS Classes:**
```html
bg-white/5 border border-white/20 rounded-xl px-4 py-3 
backdrop-blur-sm
```

---

## 7️⃣ Browser Compatibility Test

Test in:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

**Key elements to verify:**
- Backdrop blur works (`backdrop-blur-sm`)
- Rounded corners render correctly
- Font weights display properly
- White/opacity colors look right

---

## 8️⃣ Accessibility Test

- [ ] Images have alt text ("Max", "Jacob")
- [ ] Text has sufficient contrast on blue background
- [ ] Links are keyboard accessible (Tab works)
- [ ] Focus states visible on CTAs
- [ ] Text is readable at 200% zoom

---

## 9️⃣ Performance Test

- [ ] Section loads without flash of unstyled content
- [ ] Images load smoothly (use team_photos from view model)
- [ ] No console errors
- [ ] No missing data warnings

---

## 🔟 Edge Cases

### Test Case: Very Long Business Name

**Input:**
```
"ABC Professional Plumbing & Heating Services LLC of Greater Orlando"
```

**Expected:**
- Text should wrap naturally
- CTA text may truncate on mobile but still readable
- No overflow/broken layout

---

### Test Case: No City Data

**Input:**
```
city: null or ""
```

**Expected:**
- Falls back to "your area" (from hero.city which handles this)
- Section still renders

---

### Test Case: Missing Company Name

**Input:**
```
company_name: null
```

**Expected:**
- Falls back to brand_or_domain (e.g., "orlandoplumbing.com")
- Section still renders

---

## 🐛 Common Issues & Fixes

### Issue 1: "two_founders is undefined"

**Cause:** View model not rebuilding after code change

**Fix:**
```bash
# Restart server
npm restart
# Or force regenerate audit
```

---

### Issue 2: Metric Callout Not Showing

**Cause:** Both mobile_score and ai_score are null

**Expected Behavior:** This is correct! Box should not render.

**Check:**
```javascript
// In audit view model
console.log(vm.health_snapshot.metrics);
// Look for 'design' and 'geo' scores
```

---

### Issue 3: CTAs Still Say "Get My Free Plan"

**Cause:** Template not updated or cache issue

**Fix:**
```bash
# Hard refresh browser
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
# Check template has <%= vm.two_founders.primary_cta_text %>
```

---

### Issue 4: Credibility Chips Not Stacking

**Cause:** Missing `space-y-2` class on container

**Fix:** Check template has:
```html
<div class="w-full max-w-sm space-y-2 mb-4">
```

---

## ✅ Sign-Off Checklist

Before considering this feature complete:

- [ ] All personalization variables working
- [ ] Credibility chips render correctly
- [ ] Audit proof metric shows (when data available)
- [ ] Outcome bullets are not feature-focused
- [ ] CTAs are personalized
- [ ] Mobile layout works
- [ ] No console errors
- [ ] No generic "your site" language
- [ ] Graceful degradation tested
- [ ] All test cases pass

---

## 📊 QA Test Matrix

| Test | Input | Expected Output | Status |
|------|-------|-----------------|--------|
| Full data | All fields populated | All elements render | ✅ |
| No mobile score | mobile: null, ai: 42 | AI score shows | ✅ |
| No scores | mobile: null, ai: null | Proof box hidden | ✅ |
| Zero issues | total: 0, critical: 0 | "0 issues (0 critical)" | ✅ |
| Long name | 50+ char business name | Text wraps naturally | ✅ |
| No city | city: null | Falls back to "your area" | ✅ |
| Mobile view | Screen <768px | Single column layout | ✅ |

---

## 🚀 Deployment Verification

After deploying to production:

1. **Pick 3 random audits** (different niches)
2. **Check each has:**
   - ✅ Business name in intro
   - ✅ City in intro
   - ✅ Real issue counts
   - ✅ Missed leads estimate
   - ✅ Personalized CTA text
3. **Verify no errors** in browser console
4. **Check mobile layout** on real device

---

## 📝 Notes for Developers

### Where to Find Data

**View Model:**
```javascript
// File: server/helpers/auditViewModelV2.js
// Function: buildTwoFoundersSection()
// Line: ~1890
```

**Template:**
```html
<!-- File: server/views/audit-public-v2.ejs -->
<!-- Section: TWO FOUNDERS PROMISE -->
<!-- Line: ~1254 -->
```

**Data Sources:**
```javascript
// Issues counts
baseViewModel.improvement_backlog.counts

// Scores
baseViewModel.health_snapshot.metrics
```

### How to Modify

**Change credibility chips:**
```javascript
// In buildTwoFoundersSection()
credibility_chips: [
  { icon: '✅', text: 'Your Text', detail: 'your detail' },
  // Add more...
]
```

**Change missed leads formula:**
```javascript
// Current: critical_issues * 5-8
const missed_leads_min = Math.max(10, issues_critical * 5);
const missed_leads_max = Math.max(20, issues_critical * 8);

// Adjust multipliers as needed
```

**Change outcome bullets:**
```javascript
outcome_bullets: [
  'Your new outcome-focused text...',
  // Add more...
]
```

---

## 🎯 Success Criteria

This feature is successful if:

1. ✅ Every audit shows business-specific data (not generic)
2. ✅ Users say "wow, they actually analyzed MY site"
3. ✅ Credibility stack makes founders more trustworthy
4. ✅ No fake data or invented metrics
5. ✅ Section works on all devices
6. ✅ Zero console errors
7. ✅ Graceful degradation for missing data

**Goal:** Transform from "template pitch" to "personalized proof report"
