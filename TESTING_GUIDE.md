# Testing Guide - Admin Audit Updates

## Quick Start

### Prerequisites
1. Server must be running: `npm start` (or `node server/server.js`)
2. Admin password configured in `.env`: `ADMIN_PASSWORD=...`
3. OpenRouter API key configured: `OPENROUTER_API_KEY=...`

---

## Part A: Evidence-Only LLM Testing

### Test 1: Create New Audit Job

1. **Navigate to Admin**
   - Go to `/admin` and log in
   - Click "Audits" or go to `/admin/audits`

2. **Create New Job**
   - Click "Create New Audit"
   - Fill in:
     - URL: `https://example-plumber.com` (or any real local service website)
     - Niche: `plumbing`
     - City: `Miami`
     - Company Name: (optional)
   - Click "Create"

3. **Run Full Process**
   - On the audit detail page, click "Process"
   - Wait for scraping to complete (~30-60 seconds)
   - Status should change: `draft` → `scraping` → `evaluating` → `ready`

### Test 2: Verify Layout Summary

1. **Check Scrape Results**
   - Look at "B) Scrape Preview" section
   - Should see standard fields (Title, CTAs, Phone, etc.)

2. **Check Database JSON** (in "D) Outputs" section)
   - Look at "Mini Audit" JSON
   - Verify it includes these fields:
     ```json
     {
       "scrape_result_json": {
         "layout_summary": {
           "has_phone_in_header": true/false,
           "phone_clickable_tel_link": true/false,
           "hero_h1_text": "...",
           "hero_subheadline": "...",
           "primary_cta_text": "...",
           "has_primary_cta_above_fold": true/false,
           "has_trust_badge_above_fold": true/false,
           "contact_page_detected": true/false,
           "contact_form_detected": true/false
         },
         "trust_snippets": { ... },
         "cta_analysis": { ... },
         "contact_friction": { ... }
       }
     }
     ```

### Test 3: Verify Evidence in Issues

1. **Check Mini Audit JSON**
   - Look at `top_3_leaks` array
   - Each issue should have:
     ```json
     {
       "problem": "Brief description",
       "evidence": "layout_summary.field_name: value",
       "fix": "Actionable fix",
       "why_it_matters": "Miami local context",
       "insufficient_signal": false
     }
     ```

2. **Verify Evidence Quality**
   - Evidence field should reference exact field names
   - Examples of GOOD evidence:
     - ✅ `"layout_summary.phone_clickable_tel_link: false"`
     - ✅ `"contact_friction.phone_in_header: false"`
     - ✅ `"cta_analysis.has_cta_above_fold: false"`
   - Examples of BAD evidence (should NOT appear):
     - ❌ `"No phone number found"` (too vague)
     - ❌ `"Poor CTA placement"` (no field reference)
     - ❌ Generic statements without data backing

3. **Check Compliance**
   - NO percentages (e.g., "increase by 25%")
   - NO guarantees (e.g., "guaranteed results")
   - NO negative generalizations (e.g., "your website is bad")
   - Text should be concise and specific

### Test 4: Test Validation Failure

To test the validation logic:

1. **Manually Create Invalid Output** (for debugging)
   - Use "Run LLM Evaluators" with custom prompt
   - Temporarily modify prompt to NOT include evidence
   - System should catch this and show error

2. **Expected Error Message**
   ```
   LLM output validation failed: N issue(s) missing evidence:
     - Issue 1: "Problem description" (Missing or insufficient evidence field)
   ```

3. **Check Logs**
   - Pipeline log should show validation error
   - Status should be `failed`
   - Error message should be in job record

---

## Part B: Screenshot Thumbnails + Lightbox Testing

### Test 5: View Thumbnails

1. **Open Audit Detail Page**
   - Go to `/admin/audits/<id>` for any completed job
   - Scroll to "B) Scrape Preview" section

2. **Verify Thumbnails**
   - Should see TWO small images (~320px wide):
     - "Above-the-fold Screenshot"
     - "Full Page Screenshot"
   - Below each: "Click to enlarge" text
   - If images missing: "Not available" text or red error box

3. **Check Thumbnail Styling**
   - Rounded corners
   - Border: 1px solid #2d2d44
   - Hover effect: opacity changes, border turns blue
   - Cursor: pointer

### Test 6: Lightbox Functionality

**Test Above-the-fold Screenshot:**

1. **Click thumbnail** → Lightbox opens
2. **Verify modal appearance**:
   - Dark overlay (92% black)
   - White content box centered
   - Header: "Above-the-fold (Job #123)"
   - Large image (responsive)
   - Two buttons: "Open in new tab" + "Close"

3. **Test close methods**:
   - Click "Close" button → closes
   - Click X button → closes
   - Press ESC key → closes
   - Click outside content box (on dark overlay) → closes

4. **Test "Open in new tab"**:
   - Click button → new tab opens with full-size image

**Test Full Page Screenshot:**

1. **Click fullpage thumbnail** → Lightbox opens
2. **Verify scroll behavior**:
   - Image might be VERY tall
   - Content box should have vertical scroll
   - Can scroll within modal to see entire image

3. **Test all close methods** (same as above-the-fold)

### Test 7: Error Handling

**Simulate Missing Screenshot:**

1. **Edit database** or **rename screenshot file** to break path
2. **Reload admin page**
3. **Expected behavior**:
   - Thumbnail should NOT display
   - Red error box: "Screenshot not available (404)"
   - No broken image icon

**Test with Fresh Job:**

1. **Create new job** but stop before screenshots are generated
2. **View detail page**
3. **Expected**: "Not available" text (not error, just placeholder)

---

## Part C: Prompt Testing

### Test 8: Custom Prompts

1. **Open "LLM Settings" modal**
   - Click "LLM Settings" button in admin header

2. **Verify Default Prompts**
   - Should see 3 assistants:
     - UX Specialist
     - Web Designer
     - Email Polisher
   - Each has:
     - Name field
     - Model dropdown
     - Temperature (0.0-1.0)
     - Prompt textarea (large, with evidence rules)

3. **Modify Prompt**
   - Edit UX Specialist prompt
   - Add custom instruction (e.g., "Focus on phone number issues")
   - Click "Save Settings"
   - Click "Run LLM Evaluators"

4. **Verify Custom Prompt Used**
   - Check "C) LLM Control Panel" → "Prompt Version Snapshot"
   - Should show your custom settings

### Test 9: Evidence-Only Enforcement

**Test Case: Force Insufficient Signal**

1. **Scrape a website with minimal signals**
   - Use a site with no phone in header, no clear CTA
2. **Run LLM Evaluators**
3. **Check output**:
   - Should see `"insufficient_signal": true` on some issues
   - Evidence field should explain what's missing
   - Example:
     ```json
     {
       "problem": "Cannot evaluate phone accessibility",
       "evidence": "layout_summary.has_phone_in_header is false, but phone number presence unclear",
       "insufficient_signal": true
     }
     ```

---

## Part D: Integration Testing

### Test 10: Full Pipeline

1. **Create job** → Process → Run LLM → Generate Email → Generate Public Page
2. **Verify each step**:
   - ✅ Scraping: layout_summary populated
   - ✅ LLM: issues have evidence
   - ✅ Email: references findings
   - ✅ Public page: displays leaks correctly
   - ✅ Screenshots: thumbnails work, lightbox works

### Test 11: Multiple Jobs

1. **Create 3+ different audit jobs**
   - Different niches (plumbing, roofing, hvac)
   - Different cities
2. **Process all of them**
3. **Compare evidence quality**:
   - Each should have specific evidence
   - No generic/copied issues
   - Evidence matches the specific site

---

## Expected Results Summary

### ✅ PASS Criteria

**Part A (Evidence-Only):**
- [ ] `layout_summary` appears in scrape results
- [ ] All issues have `evidence` field with field references
- [ ] No percentages, guarantees, or negative language
- [ ] Text is concise (under limits)
- [ ] Validation catches missing evidence

**Part B (Thumbnails + Lightbox):**
- [ ] Thumbnails display at ~320px
- [ ] Click opens lightbox
- [ ] Lightbox has all 5 close methods
- [ ] "Open in new tab" works
- [ ] Error handling shows red box for 404
- [ ] Fullpage screenshot scrolls vertically

**Part C (Prompts):**
- [ ] Default prompts include evidence rules
- [ ] Custom prompts can be saved and used
- [ ] Prompt version snapshot appears in output

**Part D (Integration):**
- [ ] Full pipeline completes without errors
- [ ] All outputs reference evidence
- [ ] Multiple jobs work independently

---

## Troubleshooting

### Issue: Screenshots not loading
- **Check**: `/public/audit_screenshots/<jobId>/` directory exists
- **Check**: Files are named `above-fold.png` and `fullpage.png`
- **Check**: Static file serving is working (test with other static files)

### Issue: Validation fails on all jobs
- **Check**: Prompt includes evidence instructions
- **Check**: LLM model is responding correctly
- **Check**: JSON parsing is working

### Issue: Lightbox doesn't open
- **Check**: Browser console for JavaScript errors
- **Check**: `openLightbox()` function is defined
- **Check**: Click event handler is attached

### Issue: Evidence field is empty
- **Check**: `layout_summary` was extracted during scraping
- **Check**: LLM prompt includes evidence requirements
- **Check**: Validation function is running

---

## Debug Tips

### View Raw JSON
1. Open browser DevTools (F12)
2. Go to Console
3. Type: `JSON.stringify(auditJob, null, 2)`
4. View full job data including layout_summary

### Check Screenshot Paths
1. Right-click thumbnail → "Inspect"
2. Check `src` attribute
3. Should be: `/public/audit_screenshots/<jobId>/above-fold.png`

### Test Lightbox Manually
1. Open browser console
2. Run: `openLightbox('/public/audit_screenshots/1/above-fold.png', 'Test', false)`
3. Lightbox should open

### Verify Validation
1. Check pipeline logs in admin
2. Look for: `[llm] LLM evaluators completed` or `[error] ...`
3. Error should show which issues failed validation

---

## Success Metrics

After testing, you should see:

1. **Evidence Quality**: 90%+ of issues have field-referenced evidence
2. **Compliance**: 0% prohibited content (percentages, guarantees)
3. **UI Responsiveness**: Lightbox opens in <200ms
4. **Error Handling**: 100% graceful (no broken images, no console errors)
5. **Validation**: 100% of invalid outputs caught

---

**Last Updated:** January 15, 2026  
**Version:** 1.0  
**Related Docs:** IMPLEMENTATION_SUMMARY.md

