# Contacts v2 Admin UI Examples

This document shows what you'll see in the admin UI after implementing Contacts v2.

## Location
Admin UI → Audit Detail Page → Section B: Scrape Preview

## Example 1: Well-Structured Site (JSON-LD + Links)

### Scenario
A professional plumbing website with:
- JSON-LD structured data
- Clickable phone/email links
- Social media profiles
- Contact page

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
• (305) 555-1234 [jsonld]
• (305) 555-5678 [tel_link]

Emails:
• info@miamiplumbing.com [jsonld]
• contact@miamiplumbing.com [mailto_link]

Address:
123 Main St, Miami, FL 33101 [jsonld]

Hours:
Monday-Friday: 8:00 AM - 6:00 PM
Saturday: 9:00 AM - 3:00 PM
Sunday: Closed [jsonld]

Social Links:
Facebook:
• https://facebook.com/miamiplumbing [jsonld]

Instagram:
• https://instagram.com/miamiplumbing [profile_link]

Yelp:
• https://yelp.com/biz/miami-plumbing-co [business_link]

Google Maps:
• https://maps.google.com/?cid=123456789 [maps_link]
```

### Source Breakdown
- **jsonld** = Found in JSON-LD structured data (highest quality)
- **tel_link** = Clickable phone link in header
- **mailto_link** = Clickable email link in footer
- **profile_link** = Social profile link
- **business_link** = Business listing link
- **maps_link** = Google Maps location link

---

## Example 2: Modern Site (No JSON-LD)

### Scenario
A modern roofing website with:
- Clickable phone in header
- Email link in footer
- Social media icons
- No JSON-LD structured data

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
• (305) 789-4561 [tel_link]

Emails:
• info@miamiroofing.com [mailto_link]

Address:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, regex
Candidates found: 0

Hours:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, day_pattern
Candidates found: 0

Social Links:
Facebook:
• https://facebook.com/miamiroofing [profile_link]

Instagram:
• https://instagram.com/miamiroofing [profile_link]
```

### Source Breakdown
- **tel_link** = Clickable phone in header
- **mailto_link** = Clickable email in footer
- **profile_link** = Social profile links in footer
- **Debug info shown** = Address/hours not found (no structured data)

---

## Example 3: Old Site (Plain Text Contacts)

### Scenario
An older HVAC website with:
- Phone number as plain text in footer
- Email as plain text (no mailto: link)
- No social media
- No JSON-LD

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
• (305) 234-5678 [footer_text]
• (305) 234-5679 [body_regex]

Emails:
• service@miamihvac.com [footer_text]

Address:
456 Oak Ave, Miami, FL 33102 [regex]

Hours:
Monday-Friday: 7:00 AM - 7:00 PM
Weekends by appointment [day_pattern]

Social Links:
None found

Debug:
Sources checked: homepage_dom, all_links
Candidates found: 0
```

### Source Breakdown
- **footer_text** = Found as plain text in footer (regex extracted)
- **body_regex** = Found as plain text in body (lower priority)
- **regex** = Address detected by regex pattern
- **day_pattern** = Hours detected by day/time pattern
- **Debug info shown** = No social links found

---

## Example 4: Contact Page Only

### Scenario
A landscaping website where:
- No phone on homepage
- Phone is on contact page only
- Email on homepage

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
• (305) 876-5432 [contact_page_tel_link]

Emails:
• info@miamilandscaping.com [mailto_link]

Address:
789 Pine St, Miami, FL 33103 [contact_page_text]

Hours:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, day_pattern
Candidates found: 0

Social Links:
Facebook:
• https://facebook.com/miamilandscaping [profile_link]
```

### Source Breakdown
- **contact_page_tel_link** = Phone found on contact page (clickable)
- **contact_page_text** = Address found on contact page (text)
- **mailto_link** = Email found on homepage (footer)
- **profile_link** = Social found on homepage (footer)

### Logs Show
```
[scrape] Contact page detected: https://example.com/contact
[scrape] Contact page scraped: 1 phones, 0 emails
```

---

## Example 5: No Contacts Found

### Scenario
A modern website that:
- Uses a contact form only
- No direct phone/email visible
- Social media links hidden in JavaScript

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex, contact_page
Candidates found: 0

Emails:
None found

Debug:
Sources checked: homepage_dom, mailto_links, header_text, footer_text, body_regex, contact_page
Candidates found: 0

Address:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, regex
Candidates found: 0

Hours:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, day_pattern
Candidates found: 0

Social Links:
None found

Debug:
Sources checked: homepage_dom, all_links
Candidates found: 0
```

### Interpretation
- **All candidates_found: 0** = No contacts detected anywhere
- **Sources checked** = Shows all extraction methods attempted
- **Likely reasons**:
  - Contact form only
  - Contacts in images
  - JavaScript-rendered content
  - Hidden behind user interaction

---

## Example 6: Validation Issues

### Scenario
A website with:
- Phone number with extension: `(305) 555-1234 x123`
- International number: `+44 20 1234 5678`
- Email with special chars: `sales+marketing@example.com`

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex
Candidates found: 3

Emails:
• sales+marketing@example.com [mailto_link]

Address:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, regex
Candidates found: 1

Hours:
None found

Debug:
Sources checked: jsonld, schema_markup, css_selectors, day_pattern
Candidates found: 0

Social Links:
None found

Debug:
Sources checked: homepage_dom, all_links
Candidates found: 0
```

### Interpretation
- **Phones - Candidates: 3, Found: 0** = Detected 3 phone-like strings but validation failed
  - Likely: Extensions, international format, or invalid format
  - **Action**: Check website manually to see actual format
  
- **Emails - Candidates: n/a, Found: 1** = Email validation passed (+ is allowed)
  
- **Address - Candidates: 1, Found: 0** = Detected 1 address-like string but validation failed
  - Likely: Non-US format or incomplete address
  - **Action**: Check if address is partial or non-standard

---

## Example 7: Multiple Sources (Priority Demo)

### Scenario
A website with the same phone in multiple locations:
- JSON-LD: `+1-305-555-1234`
- Header tel: link: `(305) 555-1234`
- Footer text: `305.555.1234`
- Contact page: `305-555-1234`

### What You'll See

```
📞 Contacts (Scraper v2)

Phones:
• (305) 555-1234 [jsonld]
```

### Why Only One?
- **Deduplication**: All 4 sources have the same normalized phone (3055551234)
- **Priority**: JSON-LD wins (highest priority)
- **Normalized**: Displayed as `(305) 555-1234` (formatted)

### Source Priority (Reminder)
1. jsonld (highest)
2. tel_link
3. header_text
4. footer_text
5. body_regex
6. contact_page_* (lowest)

---

## Visual Styling Guide

### Color Coding
- **Blue** `[source_name]` = Source label
- **White** = Contact value (phone, email, etc.)
- **Red/Orange** "None found" = Missing data
- **Dark red/orange** background = Debug panel
- **Gray** = Debug text

### Layout
- **Grid 2 columns**:
  - Left: Phones, Emails, Address, Hours
  - Right: Social Links
  
- **Compact view**:
  - Each contact on one line
  - Source label inline (right side)
  
- **Debug panel**:
  - Only shown when "None found"
  - Collapsible style
  - Slightly darker background

### Click Actions
- **Social links**: Clickable, open in new tab
- **Long URLs**: Truncated to 40 chars + "..."
- **Screenshots**: Can still click to enlarge

---

## Developer Notes

### Testing Checklist

When testing the admin UI, verify:

1. **Source labels visible**: Every contact has `[source_name]`
2. **Debug info shown**: When "None found", debug panel appears
3. **Deduplication works**: Same contact not listed twice
4. **Priority respected**: Highest priority source is displayed
5. **Formatting correct**: Phones formatted as `(XXX) XXX-XXXX`
6. **Links clickable**: Social links open correctly
7. **Backward compatible**: Old audits (without source) still display

### Browser Console

No JavaScript errors should appear. If you see errors related to:
- `contacts.phones.forEach` → Check if `contacts.phones` is an array
- `contactsDebug.phones` → Check if `contacts_debug` exists in `scrape_result_json`
- Undefined properties → Check if object structure matches expected format

### Database Check

Query an audit to verify data structure:

```sql
SELECT 
  id, 
  json_extract(scrape_result_json, '$.contacts.phones') as phones,
  json_extract(scrape_result_json, '$.contacts_debug') as debug
FROM audit_jobs 
WHERE id = 1;
```

Expected output:
```json
{
  "phones": [
    {"value": "(305) 555-1234", "source": "tel_link", "raw": "+1-305-555-1234"}
  ],
  "debug": {
    "phones": {
      "sources_checked": ["homepage_dom", "tel_links", "..."],
      "candidates_found": 2
    }
  }
}
```

---

## Summary

### UI Enhancements
- ✅ Source labels for all contacts
- ✅ Debug info when contacts not found
- ✅ Color coding for visibility
- ✅ Clickable social links
- ✅ Compact, organized layout

### Developer Benefits
- 🔍 Instant debugging (see what was checked)
- 📊 Quality insights (see candidate counts)
- 🎯 Priority clarity (see which source won)
- 🛠️ Validation feedback (see why filtered)

### User Benefits
- 📞 More contacts extracted (3 sources vs 1)
- 🎨 Better UI (organized, labeled, color-coded)
- 🐛 Self-service debugging (no need to check logs)
- ✨ Trust in data (see where it came from)

All examples are now live in the admin UI! 🎉

