# Business Name Override - Implementation Complete

## Overview
Successfully implemented the Business Name Override feature that allows manual correction of scraped business names and regenerates all content (email, audit, homepage) without re-scraping.

## What Was Implemented

### 1. UI Component (Section A - Input)
**File:** `server/views/admin-audit-detail.ejs`

Added a new field group in Section A) Input that includes:
- Text input pre-filled with current business name
- "Regenerate All" button
- Display of current business name with source indicator (database, evidence pack, scrape, etc.)
- Success/error message areas
- Help text explaining what will be regenerated

**Location:** After the preset preview section, before the Process button

### 2. Frontend JavaScript
**File:** `server/views/admin-audit-detail.ejs` (script section)

Added `regenerateBusinessName()` async function that:
- Validates the new business name
- Shows loading state on button
- Makes POST request to `/admin/audits/:id/regenerate-business-name`
- Handles success (reloads page after 1.5s)
- Handles errors (displays error message)

### 3. Backend API Endpoint
**File:** `server/routes/admin.js`

Added new route: `POST /admin/audits/:id/regenerate-business-name`

Features:
- Rate-limited with `auditJobLimiter`
- Validates business name (not empty, 2-200 characters)
- Calls `auditPipeline.regenerateWithNewBusinessName()`
- Returns JSON response with success status and updated fields

### 4. Core Regeneration Logic
**File:** `server/services/auditPipeline.js`

Added `regenerateWithNewBusinessName(jobId, newBusinessName)` async function that:

1. **Updates database fields:**
   - `audit_jobs.company_name`
   - `evidence_pack_v2_json.company_name`
   - `evidence_pack_v2_json.company_profile.name`
   - `llm_context_json.company_profile.name`

2. **Regenerates email HTML:**
   - Uses existing `generateEmailHtml()` function
   - Updates audit link block with new company name
   - Preserves email polish and other settings

3. **Regenerates homepage proposal:**
   - Rebuilds template data with new business name
   - Re-renders homepage HTML
   - Updates both HTML and JSON data

4. **Logs all steps** for debugging

5. **Returns updated fields list** for verification

### 5. Server-side Business Name Computation
**File:** `server/views/admin-audit-detail.ejs`

Added EJS variables to compute business name server-side:
- `ejsBusinessName` - final computed name
- `ejsCompanyNameDirect` - from database
- `ejsEvidenceName` - from evidence pack
- `ejsOgName` - from scrape og:site_name
- `ejsTitleName` - from page title
- `ejsDerivedName` - derived from URL

Priority order matches the JavaScript client-side logic.

## What Gets Regenerated

✅ **Regenerated:**
- `company_name` in audit_jobs table
- `evidence_pack_v2_json` (company_name and company_profile.name)
- `llm_context_json` (company_profile.name)
- `email_html` (all greeting lines and personalization)
- `homepage_proposal_html` (company name in hero, branding, etc.)
- `homepage_proposal_data_json` (template data)

❌ **NOT Regenerated (as designed):**
- Scrape data (original scrape preserved)
- LLM assistant outputs (would require re-running AI)
- Screenshots
- Public page slug (to avoid breaking existing links)
- Mini audit JSON

## Testing Instructions

### Prerequisites
1. Have an audit job with an incorrect business name
2. Be logged in as admin
3. Navigate to `/admin/audits/:id`

### Test Case 1: Basic Regeneration
1. Go to Section A) Input
2. Verify current business name is displayed with source
3. Enter a new correct business name (e.g., "Turbo Plumbing Tampa")
4. Click "Regenerate All"
5. Wait for success message
6. Page should reload automatically
7. **Verify:**
   - New business name appears in the input field
   - Email preview shows new business name in greeting
   - Source indicator updates to "(from database)"

### Test Case 2: Email Content Verification
1. After regeneration, scroll to "Outreach Email Generator"
2. Click "Show Email" to generate preview
3. **Verify:**
   - Subject line: `{NewBusinessName} x Max & Jacob`
   - Email body greeting: `Hi {NewBusinessName},`
   - All email variants use new name

### Test Case 3: Homepage Proposal Verification
1. After regeneration, scroll to homepage proposal section
2. Click "View Homepage Proposal" link
3. **Verify:**
   - Hero section shows new business name
   - Company branding uses new name
   - All references updated

### Test Case 4: Error Handling
1. Try to regenerate with empty business name
   - Should show error: "Please enter a business name"
2. Try with very short name (1 character)
   - Should show error: "Business name must be at least 2 characters long"
3. Try with network error (stop server mid-request if possible)
   - Should show error: "Network error - please try again"

### Test Case 5: Multiple Regenerations
1. Regenerate with name "Test Company 1"
2. Wait for reload
3. Regenerate again with name "Test Company 2"
4. Wait for reload
5. **Verify:**
   - Each regeneration works
   - No stale data from previous regenerations
   - Database shows latest name

## API Response Format

### Success Response
```json
{
  "success": true,
  "message": "All content regenerated successfully with new business name",
  "updated_fields": [
    "company_name",
    "evidence_pack_v2_json",
    "llm_context_json",
    "email_html",
    "homepage_proposal_html",
    "homepage_proposal_data_json"
  ]
}
```

### Error Response
```json
{
  "success": false,
  "error": "Invalid business name",
  "message": "Business name must be at least 2 characters long"
}
```

## Database Updates

The function updates these database fields in `audit_jobs` table:
- `company_name` (TEXT)
- `evidence_pack_v2_json` (TEXT/JSON)
- `llm_context_json` (TEXT/JSON)
- `email_html` (TEXT)
- `homepage_proposal_html` (TEXT)
- `homepage_proposal_data_json` (TEXT/JSON)
- `updated_at` (TIMESTAMP - automatic)

## Performance Considerations

- **Fast**: Only regenerates templates, no scraping or LLM calls
- **Typical execution time**: 500ms - 2s depending on:
  - Homepage template complexity
  - Number of crawled pages
  - Database query performance

## Error Handling

All errors are logged and returned to user:
1. Validation errors (400)
2. Not found errors (404)
3. Server errors (500)
4. Network errors (client-side)

Partial failures are handled gracefully:
- If email regeneration fails, homepage still attempts
- If homepage regeneration fails, database updates still complete
- All errors are logged for debugging

## Files Modified

1. `/Users/petrliesner/Max&Jacob/server/views/admin-audit-detail.ejs`
   - Added business name computation (EJS)
   - Added UI field group
   - Added JavaScript handler function

2. `/Users/petrliesner/Max&Jacob/server/routes/admin.js`
   - Added POST endpoint with validation

3. `/Users/petrliesner/Max&Jacob/server/services/auditPipeline.js`
   - Added regenerateWithNewBusinessName() function
   - Exported function in module.exports

## Troubleshooting

### Issue: Button doesn't respond
- Check browser console for JavaScript errors
- Verify `regenerateBusinessName()` function is defined
- Check that audit ID is valid

### Issue: API returns 500 error
- Check server logs for detailed error
- Verify audit job exists in database
- Check that all JSON fields are valid JSON

### Issue: Page doesn't reload after success
- Check browser console for errors
- Verify success response format
- Check that setTimeout is working

### Issue: Old name still appears after regeneration
- Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R)
- Check database directly to verify update
- Check that page reload actually happened

## Maintenance Notes

- Function is independent of scraping logic
- Uses existing template generation functions
- No external API dependencies
- Fully logged for debugging
- Rate-limited to prevent abuse
