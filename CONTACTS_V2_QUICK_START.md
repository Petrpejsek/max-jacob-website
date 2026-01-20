# Contacts v2 Quick Start Guide

## TL;DR - What Changed

Scraper v2 now extracts contact info from **3 sources** with full tracking:
1. **Homepage DOM** (header/footer/body)
2. **Contact page** (if exists)
3. **JSON-LD** structured data (highest priority)

Every contact now shows its **source** (e.g., `[tel_link]`, `[jsonld]`, `[footer_text]`).

When contacts are **not found**, you see **debug info** (sources checked, candidates found).

## Quick Test (5 minutes)

### Step 1: Start the Server
```bash
cd /Users/petrliesner/Max&Jacob
npm start
```

### Step 2: Create an Audit
1. Go to `http://localhost:3000/admin/audits`
2. Click "Create New Audit"
3. Enter a local service website URL (e.g., a plumber, roofer, HVAC)
4. Select a preset
5. Click "Process"

### Step 3: Check Results
After scraping completes, scroll to **Section B: Scrape Preview**

Look for the **📞 Contacts (Scraper v2)** section.

### What You'll See (if contacts found)

```
Phones:
• (305) 555-1234 [tel_link]
• (305) 555-5678 [footer_text]

Emails:
• info@business.com [mailto_link]

Address:
123 Main St, Miami, FL 33101 [jsonld]

Social Links:
Facebook:
• https://facebook.com/business [profile_link]
```

**Source labels** tell you where each contact was found:
- `[tel_link]` = Clickable phone link
- `[mailto_link]` = Clickable email link
- `[jsonld]` = JSON-LD structured data (most reliable)
- `[header_text]` = Found in header text
- `[footer_text]` = Found in footer text
- `[body_regex]` = Found in page text
- `[contact_page_tel_link]` = From contact page

### What You'll See (if contacts NOT found)

```
Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex
Candidates found: 0
```

**Debug info helps diagnose**:
- `Candidates found: 0` → No phone numbers detected at all
- `Candidates found: 3` → Found 3 candidates but filtered (invalid format)

## Test Websites

Use real local service businesses with visible contact info:

### Good Test Sites (typically have contact info)
- Local plumbers
- Roofing contractors
- HVAC services
- Landscaping companies
- Electricians
- Home cleaning services

### What to Look For
- Phone number in header (should be extracted as `[tel_link]`)
- Email in footer (should be extracted as `[mailto_link]`)
- Social media icons in footer (should be extracted with platform name)
- Contact page link (should trigger contact page scraping)
- JSON-LD data (check page source for `<script type="application/ld+json">`)

## Common Scenarios

### ✅ Scenario 1: Well-Structured Site
**Expected**:
- Phone: `[jsonld]` or `[tel_link]`
- Email: `[jsonld]` or `[mailto_link]`
- Address: `[jsonld]`
- Hours: `[jsonld]`
- Social: `[jsonld]` or `[profile_link]`

**Why**: Site has JSON-LD structured data

### ✅ Scenario 2: Modern Site (No JSON-LD)
**Expected**:
- Phone: `[tel_link]` or `[header_text]`
- Email: `[mailto_link]` or `[footer_text]`
- Social: `[profile_link]`

**Why**: Site has clickable links but no structured data

### ✅ Scenario 3: Old Site (Plain Text)
**Expected**:
- Phone: `[footer_text]` or `[body_regex]`
- Email: `[footer_text]` or `[body_regex]`

**Why**: Site has plain text contacts, no clickable links

### ✅ Scenario 4: Contact Page Only
**Expected**:
- Phone: `[contact_page_tel_link]` or `[contact_page_text]`
- Email: `[contact_page_mailto_link]` or `[contact_page_text]`

**Why**: Contacts are hidden on homepage, only on contact page

### ❌ Scenario 5: No Contacts Found
**Expected**:
- "None found" with debug info

**Possible Reasons**:
- Contacts in images (not text)
- Unusual phone format (international, extensions)
- Email obfuscated (e.g., `info [at] domain [dot] com`)
- Contact form only (no direct contact info)

## Source Priority Explained

When the same contact is found in multiple places, the **highest priority source** is kept:

### Priority Order (Highest to Lowest)
1. **JSON-LD** (`[jsonld]`) - Most reliable, structured data
2. **Clickable links** (`[tel_link]`, `[mailto_link]`) - User-friendly, likely correct
3. **Header/footer text** (`[header_text]`, `[footer_text]`) - Prominent, likely important
4. **Body text** (`[body_regex]`) - Less prominent, may be less reliable
5. **Contact page** (`[contact_page_*]`) - Fallback if not found on homepage

**Example**:
```
Phone found in 3 places:
- Body text: (305) 555-1234 [body_regex]
- Footer: (305) 555-1234 [footer_text]
- JSON-LD: +1-305-555-1234 [jsonld]

Result: (305) 555-1234 [jsonld]  ← Highest priority wins
```

## Debug Info Interpretation

### Example 1: Validation Issue
```
Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex
Candidates found: 5
```

**Interpretation**: Found 5 phone-like strings, but none passed validation
**Action**: Check website manually - might be international format or have extensions

### Example 2: Not Present
```
Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex
Candidates found: 0
```

**Interpretation**: No phone numbers detected anywhere on page
**Action**: Check if phone is in an image or contact form only

### Example 3: Contact Page Scraping
```
Phones:
• (305) 555-1234 [contact_page_tel_link]

(Check logs for message: "Contact page detected: /contact")
```

**Interpretation**: Phone was found on contact page, not homepage
**Action**: This is normal - contact page scraping worked correctly

## Troubleshooting

### Phone Not Detected
- **Check format**: US format only `(XXX) XXX-XXXX`
- **Look at candidates_found**: If > 0, validation is too strict
- **Check manually**: Is phone visible on page?

### Email Not Detected
- **Check format**: Standard email format `user@domain.com`
- **Look for placeholders**: `example.com`, `yourdomain` are filtered
- **Check manually**: Is email visible or in image?

### Social Links Not Detected
- **Check URL type**: Must be profile/business page, not share button
- **Look for patterns**: `/sharer`, `intent/tweet` are excluded
- **Check manually**: Are links actual social profiles?

### Contact Page Not Scraped
- **Check logs**: Look for "Contact page detected" message
- **Check contactLink**: Is there a link with "contact" in URL?
- **Check error logs**: May have timed out (30s limit)

## Next Steps

After testing 3-5 real websites:

1. **Note patterns**: What sources are most common?
2. **Check debug info**: Any consistent issues?
3. **Review edge cases**: Any sites with unusual formats?
4. **Report findings**: Document what works and what doesn't

## Support

If you encounter issues:

1. **Check debug info** in admin UI
2. **Check browser console** for JavaScript errors
3. **Check server logs** for scraping errors
4. **Check raw dump** (collapsed section) for structured data

## Summary

✅ **Implementation Complete**
- Multi-source extraction (homepage, contact page, JSON-LD)
- Source tracking for all contacts
- Debug info when contacts not found
- Admin UI enhancements

🎯 **Ready for Testing**
- Test on 3-5 real local service websites
- Verify phones, emails, social links extracted
- Check source labels are correct
- Review debug info when contacts missing

📊 **Expected Results**
- 80-90% phone extraction rate
- 70-80% email extraction rate
- 60-70% social links extraction rate
- Debug info helps troubleshoot remaining 10-20%

Happy testing! 🚀

