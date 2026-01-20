# Scraper v2 Implementation Summary

## Overview
Successfully implemented Scraper v2 with contact data extraction, raw dump storage, and evidence pack generation for LLM evaluators.

## What Was Implemented

### 1. Database Schema Updates (`server/db.js`)
- ✅ Added `raw_dump_json` column to `audit_jobs` table
- ✅ Added `evidence_pack_json` column to `audit_jobs` table
- ✅ Updated `AUDIT_JOB_UPDATE_FIELDS` to include new columns
- ✅ Updated `getAuditJobById` and `getAuditJobBySlug` to parse new JSON fields
- ✅ Added migration code for existing databases

### 2. Contact Extraction (`server/services/auditPipeline.js`)

#### Phone Extraction
- Extracts from `tel:` links
- Extracts from text using regex (US format)
- Normalizes to US format (10 digits)
- Limits to top 5 unique phones

#### Email Extraction
- Extracts from `mailto:` links
- Extracts from text using regex
- Normalizes to lowercase
- Filters out placeholder emails (example.com)
- Limits to top 5 unique emails

#### Social Links Extraction
- Facebook (facebook.com, fb.com)
- Instagram (instagram.com)
- Yelp (yelp.com)
- Google Maps (maps.google.com, goo.gl/maps)
- Google Business Profile (business.google.com, g.page/)
- Limits to 2 links per platform

#### Address & Hours Extraction
- Looks for schema.org markup (`itemprop="address"`, `itemprop="openingHours"`)
- Looks for common CSS classes (`.address`, `.hours`, `.business-hours`)
- Uses regex for US address patterns
- Extracts hours snippets with day/time patterns

### 3. Raw Dump Storage
Stores limited raw data for inspection (not sent to LLM):
- `headings[]`: H1-H6 tags with text (max 50)
- `nav_items[]`: Navigation link texts
- `structured_data_jsonld[]`: JSON-LD schema data (max 3 blocks)
- `homepage_text_snippet`: Body text (max 5000 chars)
- `contact_text_snippet`: Contact page text (future enhancement)

### 4. Evidence Pack Generation
Creates structured evidence pack for LLM evaluators containing:

```javascript
{
  // Job context
  niche: "plumber",
  city: "Miami",
  
  // Company profile (from contacts)
  company_profile: {
    phones: ["3055551234", "7865559876"],
    emails: ["info@example.com"],
    address: "123 Main St, Miami, FL 33101",
    hours: "Mon-Fri 8am-5pm",
    social_links: {
      facebook: ["https://facebook.com/..."],
      instagram: ["https://instagram.com/..."],
      // ...
    }
  },
  
  // Service offers (top 5 from headings/nav)
  service_offers: [
    "Emergency Plumbing",
    "Drain Cleaning",
    "Water Heater Repair"
  ],
  
  // Trust snippets (top 5 specific signals)
  trust_snippets: [
    "Trust signal found: licensed",
    "Trust signal found: insured",
    "Trust badge visible above the fold"
  ],
  
  // CTA map (primary/secondary + location)
  cta_map: {
    primary: {
      text: "Get Free Quote",
      location: "above_fold",
      exists: true
    },
    secondary: {
      texts: ["Call Now", "Schedule Service"],
      exists: true
    },
    all_ctas: ["Get Free Quote", "Call Now", ...]
  },
  
  // Contact friction analysis
  contact_friction: {
    phone_in_header: true,
    phone_clickable: false,
    phones_found: 2,
    emails_found: 1,
    contact_page_detected: true,
    contact_form_detected: false,
    clicks_to_contact: 1 // Calculated metric
  },
  
  // Layout summary
  layout_summary: {
    hero_h1_text: "Miami's Trusted Plumber",
    hero_subheadline: "24/7 Emergency Service",
    has_primary_cta_above_fold: true,
    has_trust_badge_above_fold: true,
    has_phone_in_header: true,
    phone_clickable_tel_link: false,
    contact_page_detected: true,
    contact_form_detected: false
  }
}
```

### 5. LLM Pipeline Updates
- ✅ `buildLlmInput()` now uses evidence pack as primary source
- ✅ `runLlmEvaluators()` accepts evidence pack and passes to LLM
- ✅ `processAuditJob()` generates and stores evidence pack
- ✅ `runLlmOnly()` uses stored evidence pack when re-running LLM
- ✅ Falls back to old structure for backwards compatibility

### 6. Admin UI Updates (`server/views/admin-audit-detail.ejs`)

#### New "Contacts" Section (Scraper v2)
Displays extracted contact data:
- 📞 Phones (list)
- 📧 Emails (list)
- 📍 Address
- ⏰ Hours
- 🔗 Social Links (Facebook, Instagram, Yelp, Google Maps, GBP)

#### Raw Dump (Collapsed)
Collapsible section showing:
- Headings (first 20)
- Nav items
- Structured data (JSON-LD)
- Homepage text snippet (first 500 chars)

#### Evidence Pack (Collapsed)
Collapsible section showing the complete evidence pack sent to LLM evaluators

### 7. Prompt Template Updates
Updated both `promptTemplates.js` and `admin-audit-detail.ejs` to reference new evidence pack structure:

**UX Specialist Prompt:**
- Now references `evidence_pack` fields (company_profile, contact_friction, etc.)
- Evidence format: `"contact_friction.phone_clickable: false, clicks_to_contact: 3"`
- Can note "insufficient signal" if contacts are missing

**Web Designer Prompt:**
- Now references `evidence_pack.cta_map`, `evidence_pack.layout_summary`
- Uses trust_snippets for trust-building copy suggestions

## Key Features

### 1. Contact Data Limits (Database Protection)
- Max 5 phones per site
- Max 5 emails per site
- Max 2 links per social platform
- Max 50 headings in raw dump
- Max 3 JSON-LD blocks
- Max 5000 chars for homepage text snippet

### 2. Contact Friction Metric
Calculates minimum clicks needed to contact the business:
- **0 clicks**: Phone visible in header (can dial) OR contact form on homepage
- **1 click**: Phone is clickable (tel: link) OR contact page exists
- **2 clicks**: Phone/email found elsewhere (need to scroll/search)
- **3+ clicks**: Unknown/difficult to find contact info

### 3. Evidence-Based LLM Evaluation
- LLM receives ONLY the evidence pack (not raw dumps)
- Evidence pack is structured and limited
- LLM must cite specific fields (e.g., `contact_friction.clicks_to_contact: 3`)
- If data is missing, LLM can note "insufficient signal"

### 4. Backwards Compatibility
- Old audits still work (no evidence pack)
- `buildLlmInput()` falls back to old structure if evidence pack is missing
- UI shows both new (contacts) and legacy (phone/email) fields

## File Changes Summary

| File | Changes |
|------|---------|
| `server/db.js` | Added raw_dump_json, evidence_pack_json columns + migrations |
| `server/services/auditPipeline.js` | Added contact extraction, evidence pack generation, updated LLM pipeline |
| `server/services/promptTemplates.js` | Updated prompts to reference evidence_pack |
| `server/views/admin-audit-detail.ejs` | Added Contacts section, Raw Dump, Evidence Pack sections |

## Testing Checklist

### 1. Database Migration
- [ ] Restart server and check logs for successful column additions
- [ ] Verify no errors in console: "Column raw_dump_json added", "Column evidence_pack_json added"

### 2. Scraping Test
- [ ] Create new audit job
- [ ] Run "Process" (full pipeline)
- [ ] Check that scrape completes without errors
- [ ] Verify contacts are extracted (check admin UI)
- [ ] Verify raw dump is populated
- [ ] Verify evidence pack is generated

### 3. Admin UI Test
- [ ] Open audit detail page
- [ ] Verify "Contacts" section shows extracted data
- [ ] Verify phones/emails are listed
- [ ] Verify social links show counts
- [ ] Expand "Raw Dump" section - verify data is shown
- [ ] Expand "Evidence Pack" section - verify structured data

### 4. LLM Evaluation Test
- [ ] Run LLM evaluators
- [ ] Check that evidence pack is used (in logs: "Scraper v2")
- [ ] Verify LLM issues cite evidence_pack fields
- [ ] Check that evidence field references correct structure

### 5. Backwards Compatibility Test
- [ ] Load an old audit job (without evidence pack)
- [ ] Run "Run LLM Evaluators" only
- [ ] Verify it still works (falls back to old structure)

## Usage Instructions

### For Users:
1. Create new audit job as usual
2. Click "Process" to run full pipeline (scraping + LLM + email)
3. Scroll down to "Scrape Preview" section
4. See extracted contacts in the new blue "Contacts" box
5. Expand "Raw Dump" to inspect raw data (for debugging)
6. Expand "Evidence Pack" to see what LLM receives

### For Developers:
- Evidence pack is stored in `audit_jobs.evidence_pack_json`
- Raw dump is stored in `audit_jobs.raw_dump_json`
- Contacts are in `audit_jobs.scrape_result_json.contacts`
- To access in code:
  ```javascript
  const evidencePack = job.evidence_pack_json; // Already parsed
  const contacts = job.scrape_result_json.contacts;
  ```

## Future Enhancements

### Potential Improvements:
1. **Contact Page Scraping**: Scrape dedicated contact page for more contact data
2. **Schema.org Validation**: Validate and parse LocalBusiness schema more thoroughly
3. **Phone Number Formatting**: Format phones for display (e.g., "(305) 555-1234")
4. **Social Link Validation**: Verify social links are valid profile URLs (not generic)
5. **Address Geocoding**: Geocode addresses to verify accuracy
6. **Hours Parsing**: Parse hours into structured format (open/close times per day)
7. **Trust Signal Scoring**: Calculate trust score based on signals found
8. **Contact Friction Score**: Visual indicator (🟢🟡🔴) for clicks-to-contact

### Potential Issues to Watch:
- **Regex Accuracy**: Phone/email regex might miss some formats or catch false positives
- **Address Extraction**: Simple heuristic might miss non-standard address formats
- **Hours Extraction**: Might miss hours if not in standard format
- **Social Link False Positives**: Might catch share buttons instead of profile links

## Success Metrics

After implementation, you should see:
- ✅ More contact data extracted (phones, emails, social links)
- ✅ Evidence pack generation succeeds
- ✅ LLM evaluators use evidence pack (check logs)
- ✅ Admin UI shows contacts section
- ✅ Raw dumps stored for inspection
- ✅ No database errors
- ✅ No linter errors

## Rollback Plan

If issues arise, you can:
1. Remove new columns from schema (though not recommended - they're nullable)
2. Revert `auditPipeline.js` changes
3. Old audits will continue to work (backwards compatible)
4. New scrapes will fall back to old structure if evidence pack generation fails

## Notes

- All changes are backwards compatible
- Database migrations run automatically on server start
- Evidence pack is the new source of truth for LLM evaluators
- Raw dumps are for inspection only (not sent to LLM)
- Contact extraction runs in browser context (page.evaluate)
- All limits are enforced to protect database size

---

**Implementation Date**: January 15, 2026  
**Status**: ✅ Complete  
**All TODOs**: ✅ Completed  
**Linter Errors**: ✅ None

