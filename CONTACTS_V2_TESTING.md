# Contacts v2 Testing Guide

## Overview
Scraper v2 now extracts contact information from multiple sources with full source tracking and debugging information.

## What's New

### 1. Multi-Source Extraction
Contact information is now extracted from:
- **Homepage DOM** (header, footer, body)
- **Contact Page** (if detected)
- **JSON-LD** structured data (LocalBusiness/Organization)

### 2. Source Priority
The system merges contacts with the following priority:
1. **JSON-LD** (highest priority - most reliable)
2. **tel:/mailto: links** (clickable links)
3. **Homepage header/footer text**
4. **Homepage body text**
5. **Contact page** (fallback)

### 3. Contact Types Extracted

#### Phone Numbers
- Extracted from: `tel:` links, header/footer text, body text, contact page, JSON-LD
- Normalized to US format: `(XXX) XXX-XXXX`
- Tolerant of various formats: `+1`, spaces, dashes, dots, parentheses
- Source tracked: `tel_link`, `header_text`, `footer_text`, `body_regex`, `contact_page_tel_link`, `jsonld`

#### Emails
- Extracted from: `mailto:` links, header/footer text, body text, contact page, JSON-LD
- Normalized to lowercase
- Filters out placeholders (example.com, yourdomain)
- Source tracked: `mailto_link`, `header_text`, `footer_text`, `body_regex`, `contact_page_mailto_link`, `jsonld`

#### Social Links
- **Facebook** (excludes /sharer links)
- **Instagram** (profile links only)
- **Twitter/X**
- **LinkedIn** (company pages)
- **Yelp** (business pages)
- **Google Maps** (location links)
- **Google Business Profile** (g.page links)
- Source tracked: `profile_link`, `business_link`, `maps_link`, `jsonld`

#### Address
- Extracted from: schema.org markup, CSS selectors (`.address`, `#address`), regex pattern, JSON-LD
- US format detection: `123 Main St, City, State 12345`
- Source tracked: `schema_markup`, `regex`, `jsonld`

#### Hours
- Extracted from: schema.org markup, CSS selectors (`.hours`, `.business-hours`), day/time pattern, JSON-LD
- Pattern detection: `Monday-Friday 9:00-5:00`
- Source tracked: `schema_markup`, `day_pattern`, `jsonld`

### 4. Debug Information

When contacts are **not found**, the admin UI displays:
- **Sources checked**: List of all extraction methods attempted
- **Candidates found**: Number of candidates detected (even if invalid/filtered)

This helps diagnose why contacts weren't extracted.

## Testing Checklist

### Test Websites (Local Service Businesses)

Use these types of websites for testing:
- **Plumbing**: Local plumber websites
- **Roofing**: Roofing contractor websites
- **HVAC**: Heating/cooling service websites
- **Landscaping**: Lawn care and landscaping websites
- **Electrical**: Electrician websites

### Test Cases

#### ✅ Test Case 1: Phone in Header (tel: link)
- Expected: Phone extracted with source `tel_link`
- Location: Header/navigation area
- Format: Clickable phone number

#### ✅ Test Case 2: Phone in Footer (text)
- Expected: Phone extracted with source `footer_text`
- Location: Footer area
- Format: Plain text phone number

#### ✅ Test Case 3: Email in Footer (mailto: link)
- Expected: Email extracted with source `mailto_link`
- Location: Footer area
- Format: Clickable email link

#### ✅ Test Case 4: JSON-LD Structured Data
- Expected: Phone/email/address/hours extracted with source `jsonld`
- Location: `<script type="application/ld+json">` tag
- Type: `LocalBusiness` or `Organization`

#### ✅ Test Case 5: Contact Page Exists
- Expected: Contact page detected and scraped
- Check: Additional phones/emails from contact page
- Source: `contact_page_tel_link`, `contact_page_text`

#### ✅ Test Case 6: Social Links in Footer
- Expected: Facebook, Instagram, Yelp links extracted
- Location: Footer area
- Source: `profile_link` or `business_link`

#### ✅ Test Case 7: Google Business Profile
- Expected: Google Maps or g.page link extracted
- Location: Anywhere on page
- Source: `maps_link` or `business_link`

#### ❌ Test Case 8: No Contacts Found
- Expected: "None found" message with debug info
- Debug: Shows sources checked and candidates found
- Verify: Debug info helps diagnose the issue

### Sample Test URLs

Here are some real-world examples you can test (replace with actual URLs):

```
# Plumbing
https://example-plumber-miami.com

# Roofing
https://example-roofing-contractor.com

# HVAC
https://example-hvac-service.com

# Landscaping
https://example-lawn-care.com

# Electrical
https://example-electrician.com
```

### Expected Results

For each test website, verify:

1. **Phone Numbers**
   - [ ] At least 1 phone number extracted
   - [ ] Source is correctly labeled (tel_link, header_text, etc.)
   - [ ] Format is `(XXX) XXX-XXXX`

2. **Emails**
   - [ ] At least 1 email extracted
   - [ ] Source is correctly labeled
   - [ ] Format is lowercase

3. **Social Links**
   - [ ] Facebook/Instagram/Yelp extracted (if present)
   - [ ] Source is correctly labeled
   - [ ] Links are profile/business pages (not share buttons)

4. **Address** (if present)
   - [ ] Address extracted
   - [ ] Source is labeled (schema_markup, jsonld, or regex)

5. **Hours** (if present)
   - [ ] Hours extracted
   - [ ] Source is labeled (schema_markup, jsonld, or day_pattern)

6. **Debug Info** (if no contacts found)
   - [ ] "None found" message displayed
   - [ ] Sources checked list is shown
   - [ ] Candidates found count is shown

## Admin UI Debug Panel

When viewing an audit in the admin UI (Section B: Scrape Preview), you'll see:

### Contacts Found
```
📞 Contacts (Scraper v2)

Phones:
• (305) 555-1234 [tel_link]
• (305) 555-5678 [footer_text]

Emails:
• info@business.com [mailto_link]
• contact@business.com [jsonld]

Address:
123 Main St, Miami, FL 33101 [jsonld]

Hours:
Monday-Friday: 9:00 AM - 5:00 PM [schema_markup]

Social Links:
Facebook:
• https://facebook.com/businesspage [profile_link]
Instagram:
• https://instagram.com/businesspage [profile_link]
Yelp:
• https://yelp.com/biz/business-name [business_link]
```

### Contacts Not Found (with Debug)
```
Phones:
None found

Debug:
Sources checked: homepage_dom, tel_links, header_text, footer_text, body_regex
Candidates found: 0
```

This tells you:
- The scraper checked all sources
- No phone numbers matched the validation criteria
- You may need to check the website manually to see if there's a phone number in an unusual format

## JSON-LD Example

If a website has JSON-LD structured data, it looks like this:

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Example Plumbing",
  "telephone": "+1-305-555-1234",
  "email": "info@exampleplumbing.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "Miami",
    "addressRegion": "FL",
    "postalCode": "33101"
  },
  "openingHours": "Mo-Fr 09:00-17:00",
  "sameAs": [
    "https://www.facebook.com/exampleplumbing",
    "https://www.instagram.com/exampleplumbing"
  ]
}
</script>
```

The scraper will extract:
- **Phone**: `(305) 555-1234` [jsonld]
- **Email**: `info@exampleplumbing.com` [jsonld]
- **Address**: `123 Main St, Miami, FL, 33101` [jsonld]
- **Hours**: `Mo-Fr 09:00-17:00` [jsonld]
- **Social**: Facebook and Instagram links [jsonld]

## Troubleshooting

### Phone Numbers Not Detected
- Check if the phone number is in an unusual format (international, extension, etc.)
- Look at the debug info to see how many candidates were found
- If candidates > 0 but no phones extracted, validation may be too strict

### Emails Not Detected
- Check if email is in an image instead of text
- Look at the debug info to see if any candidates were found
- Verify email doesn't contain "example.com" or "yourdomain"

### Social Links Not Detected
- Check if links are share buttons instead of profile links
- Social links must be actual profile/business pages
- Look for patterns like `/sharer` or `intent/tweet` (these are excluded)

### Address/Hours Not Detected
- Check if address is in an image/map instead of text
- Look for schema.org markup or JSON-LD
- Address must match US format: `123 Street, City, ST 12345`

## Next Steps

After testing on 3-5 real websites:

1. **Document Issues**: Note any contacts that weren't extracted correctly
2. **Check Debug Info**: See if patterns emerge (e.g., all sites missing JSON-LD)
3. **Adjust Validation**: If too strict, relax phone/email validation
4. **Expand Patterns**: If addresses/hours not detected, add more patterns

## Implementation Complete

All features are now implemented:
- ✅ Multi-source extraction (homepage, contact page, JSON-LD)
- ✅ Source tracking for all contact types
- ✅ Phone/email normalization and validation
- ✅ Social link deduplication and filtering
- ✅ Address/hours heuristics
- ✅ Contact page detection and scraping
- ✅ JSON-LD parsing for LocalBusiness/Organization
- ✅ Admin UI debug info (sources_checked, candidates_found)

Ready for real-world testing!

