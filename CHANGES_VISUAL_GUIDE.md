# Visual Guide - Before & After Changes

## Part A: LLM Evidence-Only Mode

### BEFORE: Generic, Unverified Output

```json
{
  "top_3_leaks": [
    {
      "problem": "Poor call-to-action placement",
      "evidence": "The CTA is not prominent enough",
      "fix": "Make the CTA larger and more visible",
      "why_it_matters": "This could increase conversions by 25%"
    },
    {
      "problem": "Missing trust signals",
      "evidence": "No reviews or testimonials visible",
      "fix": "Add customer reviews",
      "why_it_matters": "Trust signals are important"
    },
    {
      "problem": "Your website is bad",
      "evidence": "Overall design is poor",
      "fix": "Redesign the entire site",
      "why_it_matters": "Users won't trust a bad website"
    }
  ]
}
```

**Problems:**
- ❌ No field references in evidence
- ❌ Contains percentage ("25%")
- ❌ Vague evidence ("not prominent enough")
- ❌ Prohibited language ("Your website is bad")
- ❌ Generic advice ("Add customer reviews")

---

### AFTER: Evidence-Based, Specific Output

```json
{
  "top_3_leaks": [
    {
      "problem": "Phone number not clickable on mobile",
      "evidence": "layout_summary.phone_clickable_tel_link: false (phone detected but no tel: link)",
      "fix": "Wrap phone number in <a href='tel:...'>",
      "why_it_matters": "Miami mobile users expect tap-to-call. Friction = lost leads.",
      "insufficient_signal": false
    },
    {
      "problem": "No CTA visible above fold",
      "evidence": "layout_summary.has_primary_cta_above_fold: false, cta_analysis.all_ctas: ['Contact', 'Learn More'] (both below 720px)",
      "fix": "Add 'Get Free Estimate' button in hero (above 720px)",
      "why_it_matters": "First-time visitors need immediate action path. No CTA = bounce.",
      "insufficient_signal": false
    },
    {
      "problem": "No trust indicators in hero section",
      "evidence": "trust_snippets.has_trust_above_fold: false (licensed/insured/reviews not detected in first 720px)",
      "fix": "Add 'Licensed & Insured' badge + '500+ Miami customers' count in hero",
      "why_it_matters": "Local service buyers verify credentials immediately. Missing = credibility gap.",
      "insufficient_signal": false
    }
  ],
  "7_day_plan": [
    "Make phone clickable (tel: link) + test mobile tap",
    "Add 'Get Free Estimate' CTA above fold with Miami area code visible",
    "Add trust badge + customer count to hero section"
  ],
  "tone": "Concise, data-backed, Miami local acquisition focus"
}
```

**Improvements:**
- ✅ Every evidence field references exact fields (`layout_summary.phone_clickable_tel_link: false`)
- ✅ No percentages or guarantees
- ✅ Specific, actionable fixes
- ✅ Miami local context in "why_it_matters"
- ✅ Concise (all under character limits)
- ✅ Factual tone, no negative language

---

## Part B: Admin UI Screenshots

### BEFORE: Full-Size Images Inline

```
┌─────────────────────────────────────┐
│ B) Scrape Preview                   │
├─────────────────────────────────────┤
│ Title / H1: Example Plumbing        │
│ CTAs: Call Now, Get Quote           │
│ Phone: (305) 555-1234               │
│                                     │
│ Above-the-fold:                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │                                 │ │
│ │     [FULL SIZE IMAGE]           │ │
│ │     (1280px wide)               │ │
│ │                                 │ │
│ │     Takes up huge space         │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Full Page:                          │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │     [FULL SIZE IMAGE]           │ │
│ │     (1280px x 5000px!)          │ │
│ │                                 │ │
│ │     Extremely long              │ │
│ │     Slows down page             │ │
│ │     Hard to see overview        │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Problems:**
- ❌ Takes up massive screen space
- ❌ Hard to see overview
- ❌ Slows page load
- ❌ Can't compare multiple screenshots easily
- ❌ No error handling for missing images

---

### AFTER: Thumbnails with Click-to-Enlarge

```
┌─────────────────────────────────────────────┐
│ B) Scrape Preview                           │
├─────────────────────────────────────────────┤
│ Title / H1: Example Plumbing                │
│ CTAs: Call Now, Get Quote                   │
│ Phone: (305) 555-1234                       │
│                                             │
│ Above-the-fold Screenshot:                  │
│ ┌─────────────┐                             │
│ │   [mini]    │  ← 320px thumbnail          │
│ │   preview   │     (hover: blue border)    │
│ │   image     │     (cursor: pointer)       │
│ └─────────────┘                             │
│ Click to enlarge                            │
│                                             │
│ Full Page Screenshot:                       │
│ ┌─────────────┐                             │
│ │   [mini]    │  ← 320px thumbnail          │
│ │   preview   │                             │
│ │   (tall)    │                             │
│ └─────────────┘                             │
│ Click to enlarge (may be very tall)         │
└─────────────────────────────────────────────┘

CLICK thumbnail → Lightbox opens:

┌───────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← Dark overlay
│░░┌─────────────────────────────────────┐░░░│
│░░│ Above-the-fold (Job #123)       [X] │░░░│
│░░├─────────────────────────────────────┤░░░│
│░░│                                     │░░░│
│░░│  ┌───────────────────────────┐     │░░░│
│░░│  │                           │     │░░░│
│░░│  │   [LARGE IMAGE]           │     │░░░│
│░░│  │   Responsive (max 95vw)   │     │░░░│
│░░│  │   Scrollable if tall      │     │░░░│
│░░│  │                           │     │░░░│
│░░│  └───────────────────────────┘     │░░░│
│░░│                                     │░░░│
│░░│  [Open in new tab]  [Close]        │░░░│
│░░└─────────────────────────────────────┘░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└───────────────────────────────────────────────┘

Close methods:
✅ Click [X] button
✅ Click [Close] button
✅ Press ESC key
✅ Click dark area outside content
✅ (Full page: vertical scroll inside modal)
```

**Improvements:**
- ✅ Compact thumbnails (~320px) save space
- ✅ Quick visual check without loading full image
- ✅ Click to enlarge on demand
- ✅ Lightbox with multiple close options
- ✅ "Open in new tab" for detailed inspection
- ✅ Error handling: 404 → red error box
- ✅ Responsive (works on any screen size)

---

## Part C: Data Structure Comparison

### BEFORE: Scrape Result (Keyword-Heavy)

```json
{
  "title": "Best Plumbing in Miami",
  "h1": "Miami's Trusted Plumbers",
  "h2": ["Emergency Service", "Residential", "Commercial"],
  "ctas": ["Call Now", "Get Quote", "Contact Us", "Learn More"],
  "phone": "(305) 555-1234",
  "email": "info@example.com",
  "contact_url": "/contact",
  "trust_signals": ["licensed", "insured", "reviews"],
  "services_keywords": [
    "plumbing", "repair", "emergency", "service",
    "drain", "pipe", "water", "leak", "installation"
  ],
  "performance_summary": "Not run"
}
```

**Problems:**
- ❌ No structured UX signals
- ❌ Can't tell if phone is clickable
- ❌ Can't tell if CTA is above fold
- ❌ Keyword list is just word frequency (not useful for UX)
- ❌ LLM has to guess from raw text

---

### AFTER: Scrape Result (Evidence-Structured)

```json
{
  "title": "Best Plumbing in Miami",
  "h1": "Miami's Trusted Plumbers",
  "h2": ["Emergency Service", "Residential", "Commercial"],
  "ctas": ["Call Now", "Get Quote", "Contact Us", "Learn More"],
  "phone": "(305) 555-1234",
  "email": "info@example.com",
  "contact_url": "/contact",
  "trust_signals": ["licensed", "insured", "reviews"],
  "services_keywords": [...],
  "performance_summary": "Not run",
  
  "layout_summary": {
    "has_phone_in_header": true,
    "phone_clickable_tel_link": false,
    "hero_h1_text": "Miami's Trusted Plumbers Since 1995",
    "hero_subheadline": "24/7 Emergency Service • Licensed & Insured",
    "primary_cta_text": "Call Now",
    "has_primary_cta_above_fold": true,
    "has_trust_badge_above_fold": true,
    "contact_page_detected": true,
    "contact_form_detected": true
  }
}
```

**And LLM receives restructured input:**

```json
{
  "niche": "plumbing",
  "city": "Miami",
  "scrape_result_json": {
    "layout_summary": { ... },           // ← PRIMARY EVIDENCE
    "trust_snippets": {                  // ← TRUST SIGNALS
      "trust_signals": ["licensed", "insured", "reviews"],
      "has_trust_above_fold": true
    },
    "cta_analysis": {                    // ← CTA ANALYSIS
      "primary_cta_text": "Call Now",
      "has_cta_above_fold": true,
      "all_ctas": ["Call Now", "Get Quote", ...]
    },
    "contact_friction": {                // ← CONTACT BARRIERS
      "phone": "(305) 555-1234",
      "phone_in_header": true,
      "phone_clickable": false,
      "contact_page_detected": true,
      "contact_form_detected": true
    },
    "hero_content": {                    // ← HERO SECTION
      "h1": "Miami's Trusted Plumbers",
      "hero_h1_text": "Miami's Trusted Plumbers Since 1995",
      "hero_subheadline": "24/7 Emergency Service • Licensed & Insured"
    },
    "service_offers": {                  // ← SECONDARY CONTEXT
      "h2_headings": [...],
      "keywords": [...]
    }
  }
}
```

**Improvements:**
- ✅ Structured UX signals (boolean flags + specific values)
- ✅ Clear evidence for LLM to reference
- ✅ Phone clickability detected
- ✅ Above-fold positioning detected
- ✅ Trust badge placement detected
- ✅ Hero content extracted (max 140 chars)
- ✅ Prioritized structure (layout_summary first, keywords last)

---

## Part D: Prompt Comparison

### BEFORE: Generic Prompt

```
You are a UX Specialist auditing a local service business website.
Return ONLY valid JSON with this shape:
{
  "top_3_leaks": [
    { "problem": "...", "evidence": "...", "fix": "...", "why_it_matters": "..." }
  ],
  "7_day_plan": ["...", "...", "..."],
  "tone": "..."
}
Rules:
- No percentages or numeric guarantees.
- No legal/medical claims.
- Do not say "your website is bad".
- Keep tone professional and local to the city.
```

**Problems:**
- ❌ No guidance on what "evidence" means
- ❌ No character limits
- ❌ No insufficient_signal option
- ❌ No specific field references required
- ❌ LLM can make up generic advice

---

### AFTER: Evidence-Only Prompt

```
You are a UX Specialist auditing a local service business website in Miami.
You MUST work with EVIDENCE ONLY - no guessing, no generic advice.

Return ONLY valid JSON with this shape:
{
  "top_3_leaks": [
    { 
      "problem": "Brief issue (max 100 chars)", 
      "evidence": "Exact field reference from scrape_result_json or layout_summary (e.g. 'layout_summary.has_phone_in_header: false')", 
      "fix": "Specific, actionable fix (max 120 chars)", 
      "why_it_matters": "Local acquisition context for Miami (max 120 chars)",
      "insufficient_signal": false
    }
  ],
  "7_day_plan": ["Quick win 1", "Quick win 2", "Quick win 3"],
  "tone": "Concise, specific, acquisitional (Miami local), factual"
}

STRICT EVIDENCE RULES:
1. Every issue MUST have concrete evidence from scrape_result_json or layout_summary
2. Evidence must reference the exact field name (e.g., "layout_summary.phone_clickable_tel_link: false")
3. If you cannot find concrete evidence in the data → set "insufficient_signal": true and explain what's missing
4. Do NOT create issues without evidence
5. Maximum 3 issues (top 3 leaks only)
6. Maximum 3 steps in 7-day plan
7. Each text must be concise - no long paragraphs

PROHIBITED:
- Growth percentages or numeric projections
- Guarantees or promises ("will increase", "guaranteed results")
- Expressions like "your website is bad"
- Generic advice not tied to specific evidence
- Medical or legal claims

STYLE:
- Strive for stručné (concise), konkrétní (specific) language
- Frame findings as opportunities, not attacks
- Use Miami local context where relevant
- Focus on conversion friction that's observable in the data
```

**Improvements:**
- ✅ Clear definition of "evidence" (field references)
- ✅ Character limits specified
- ✅ `insufficient_signal` option for missing data
- ✅ Examples of proper evidence format
- ✅ Max 3 issues, max 3 steps enforced
- ✅ Specific prohibited patterns
- ✅ Style guide (concise, Miami local, factual)

---

## Summary of Visual Changes

### Admin UI Visual Impact:

**Before:**
- Full-size images take up 80% of screen
- Hard to scan multiple audits
- No quick quality check
- Slow page loads

**After:**
- Thumbnails take <20% of screen
- Easy to scan at a glance
- Click for detailed view
- Fast page loads

### LLM Output Quality:

**Before:**
- Generic, could apply to any website
- No verifiable evidence
- Often contains prohibited content
- Hard to trust accuracy

**After:**
- Specific to this exact website
- Every issue backed by data
- Compliance enforced
- Trustworthy, actionable

### Developer Experience:

**Before:**
- Unclear if LLM output is accurate
- Manual checking required
- No validation safety net

**After:**
- Evidence references show exact data used
- Server-side validation catches bad output
- Confidence in audit quality

---

**Version:** 1.0  
**Last Updated:** January 15, 2026  
**Related Docs:** IMPLEMENTATION_SUMMARY.md, TESTING_GUIDE.md

