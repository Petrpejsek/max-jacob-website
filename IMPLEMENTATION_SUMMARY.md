# Admin Audit Implementation Summary

## Completed: 2026-01-15

This document summarizes the implementation of two major features for the `/admin/audits` system:

---

## Part A: LLM Evaluators – "Evidence-Only" Mode

### Goal
Prevent generic audits by ensuring every LLM conclusion has concrete evidence from the scraped data.

### Changes Implemented

#### 1. Updated Prompt Templates (`server/services/promptTemplates.js`)
- **UX Specialist Prompt**: 
  - Added strict evidence requirements
  - Each issue must reference exact field from `scrape_result_json` or `layout_summary`
  - Added `insufficient_signal` flag for when evidence is missing
  - Limited to max 3 issues and 3 steps in 7-day plan
  - Prohibited: percentages, guarantees, negative generalizations
  - Style: Concise, specific, Miami-local acquisition focus

- **Web Designer Prompt**:
  - Evidence-based copy suggestions
  - Must reference `layout_summary` findings
  - Max 3 CTA suggestions (8-12 words each)
  - Headlines max 140 chars
  - Prohibited: generic best practices without evidence

- **Email Copy Prompt**:
  - Evidence-based subject lines and intros
  - Max 60 chars for subject, 140 for intro
  - Miami local, friendly but professional tone

#### 2. Added Layout Summary Extraction (`server/services/auditPipeline.js`)
Created comprehensive UX signal extraction in Playwright scraping:

**Signals Extracted:**
- `has_phone_in_header` - Phone number detected in header
- `phone_clickable_tel_link` - Phone is clickable (tel: link)
- `hero_h1_text` - First H1 text (max 140 chars)
- `hero_subheadline` - Subheadline near H1 (max 140 chars)
- `primary_cta_text` - Primary CTA text above fold
- `has_primary_cta_above_fold` - CTA detected in first 720px
- `has_trust_badge_above_fold` - Trust signals (licensed, insured, certified, etc.) above fold
- `contact_page_detected` - Contact page link found
- `contact_form_detected` - Contact form detected on page

#### 3. Restructured LLM Input Format (`buildLlmInput()`)
Changed from keyword-heavy to evidence-structured format:

**New Structure:**
```javascript
{
  niche, city, input_url, company_name,
  scrape_result_json: {
    layout_summary: { ... },        // Primary signals
    trust_snippets: { ... },        // Trust indicators
    cta_analysis: { ... },          // CTA detection
    contact_friction: { ... },      // Contact barriers
    hero_content: { ... },          // Hero section
    service_offers: { ... }         // Secondary context
  },
  screenshots_available: { ... }
}
```

**Priority:** `layout_summary` and `trust_snippets` over `services_keywords`

#### 4. Server-Side Validation (`validateEvidenceInIssues()`)
Added validation function that:
- Checks each issue has substantial evidence (>10 chars)
- Allows `insufficient_signal: true` as valid acknowledgment
- Throws detailed error if evidence is missing
- Called after LLM JSON parsing in `runLlmEvaluators()`

**Error Format:**
```
LLM output validation failed: N issue(s) missing evidence:
  - Issue 1: "Problem text" (Missing or insufficient evidence field)
```

---

## Part B: Admin UI – Screenshot Thumbnails + Lightbox

### Goal
Enable quick quality checks of screenshots with thumbnails and click-to-enlarge functionality.

### Changes Implemented

#### 1. Thumbnail Display (`server/views/admin-audit-detail.ejs`)

**Added CSS:**
- `.screenshot-thumbnail` - Max 320px width, clickable, hover effects
- `.screenshot-error` - Error styling for 404/missing images
- `.screenshot-label` - Helpful hint text
- `.screenshot-container` - Container with relative positioning

**Updated HTML:**
- Replaced full screenshots with thumbnails (max-width: 320px)
- Added click handlers: `onclick="openLightbox(...)"`
- Added error handlers: `onerror="...screenshot not available..."`
- Added "Click to enlarge" labels below thumbnails

#### 2. Lightbox Modal

**Added CSS:**
- `.lightbox` - Full-screen overlay (z-index: 2000, rgba(0,0,0,0.92))
- `.lightbox-content` - Scrollable content area (max 95vw x 90vh)
- `.lightbox-header` - Header with title and close button
- `.lightbox-image` - Responsive image display
- `.lightbox-actions` - Action buttons row

**Added JavaScript:**
- `openLightbox(imageSrc, title, isFullpage)` - Opens modal with image
- `closeLightbox()` - Closes modal
- ESC key handler - Closes lightbox on Escape
- Backdrop click handler - Closes on click outside content

**Added HTML Modal:**
```html
<div class="lightbox" id="screenshotLightbox">
  <div class="lightbox-content">
    <div class="lightbox-header">...</div>
    <img class="lightbox-image" id="lightboxImage">
    <div class="lightbox-actions">
      <button>Open in new tab</button>
      <button>Close</button>
    </div>
  </div>
</div>
```

#### 3. Error Handling
- `onerror` attribute replaces thumbnail with error message on 404
- Error styling: red background, border, and text
- Graceful fallback: "Not available" for missing screenshots

#### 4. Features
- **Above-fold screenshot**: Opens in modal with normal size
- **Fullpage screenshot**: Opens in modal with scroll (can be very tall)
- **Open in new tab**: Opens full image in new browser tab
- **Close methods**: X button, Close button, ESC key, backdrop click
- **Responsive**: Max 95vw x 90vh with scroll for large images

---

## Files Modified

1. **`server/services/promptTemplates.js`**
   - Updated all 3 default prompt templates with evidence requirements

2. **`server/services/auditPipeline.js`**
   - Added `layout_summary` extraction in `scrapeWebsite()`
   - Restructured `buildLlmInput()` to prioritize evidence
   - Added `validateEvidenceInIssues()` validation function
   - Integrated validation into `runLlmEvaluators()`

3. **`server/views/admin-audit-detail.ejs`**
   - Added thumbnail CSS styles
   - Added lightbox CSS styles
   - Updated screenshot HTML to use thumbnails
   - Added lightbox modal HTML
   - Added lightbox JavaScript functions
   - Updated default prompts in admin UI to match backend

---

## Testing Recommendations

### Part A Testing:
1. **Create new audit job** with test URL
2. **Run full process** - Verify scraping includes `layout_summary`
3. **Check LLM output** - Verify issues have evidence fields with field references
4. **Test validation** - Manually create invalid output to see error handling
5. **Review mini audit JSON** - Confirm evidence quality

### Part B Testing:
1. **View audit detail page** with existing job
2. **Verify thumbnails** display at ~320px width
3. **Click thumbnail** - Lightbox should open
4. **Test close methods**: X button, Close button, ESC key, backdrop click
5. **Test "Open in new tab"** button
6. **Test error handling** - Edit screenshot path to invalid URL, verify error display
7. **Test fullpage screenshot** - Verify vertical scroll works for tall images

---

## Compliance & Best Practices

### Evidence Requirements:
- ✅ Every issue references specific field (e.g., `layout_summary.has_phone_in_header: false`)
- ✅ No generic advice without data backing
- ✅ `insufficient_signal` flag when data is unclear

### Prohibited Content:
- ❌ Growth percentages
- ❌ Guarantees ("will increase", "guaranteed")
- ❌ Negative generalizations ("your website is bad")
- ❌ Medical/legal claims

### Text Limits:
- Problem: 100 chars max
- Fix: 120 chars max
- Why it matters: 120 chars max
- Headlines: 140 chars max
- CTAs: 8-12 words
- Subject line: 60 chars max
- Intro line: 140 chars max

### Admin UI:
- Thumbnail size: 320px max-width
- Lightbox: 95vw x 90vh max, scrollable
- Error handling: Graceful fallback for missing images
- Accessibility: ESC key close, backdrop click close

---

## Next Steps (Optional Enhancements)

1. **Add image caching** for thumbnails to improve performance
2. **Add zoom controls** in lightbox (zoom in/out)
3. **Add keyboard navigation** (arrow keys for multiple screenshots)
4. **Add download button** in lightbox
5. **Add evidence highlighting** in admin UI (highlight which fields LLM used)
6. **Add evidence coverage metrics** (% of layout_summary fields used in issues)
7. **Add A/B test mode** for prompt variations

---

## Notes

- All changes are backward compatible
- Existing audit jobs will work with new system
- New `layout_summary` only appears in jobs processed after this update
- Admin UI updates are purely frontend (no database changes)
- Validation errors are logged and displayed in job status

---

**Implementation Date:** January 15, 2026  
**Status:** ✅ Complete  
**Linter Errors:** 0  
**Tests Required:** Manual UI testing + LLM output verification

