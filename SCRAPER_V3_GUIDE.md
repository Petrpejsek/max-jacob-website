# Scraper v3: Multi-Page Crawler Guide

## Overview

Scraper v3 is a comprehensive website crawler that extracts rich structured data from multiple pages of a website. It replaces the single-page Scraper v2 with a powerful multi-page crawler that provides deep insights into website structure, content, and performance.

## Key Features

### 1. **Multi-Page Crawling**
- Crawls up to 50 pages from the same domain
- Intelligent URL prioritization based on page type:
  - Contact pages (priority: 100)
  - Services pages (priority: 90)
  - Reviews/testimonials (priority: 80)
  - Locations/service areas (priority: 75)
  - Pricing pages (priority: 70)
  - About pages (priority: 60)
  - Gallery/projects (priority: 50)
  - FAQ pages (priority: 40)
  - Blog/news (priority: 20)
- Automatic blacklist filtering (PDFs, images, admin pages, spam URLs)

### 2. **Per-Page Data Extraction**
For each crawled page, the scraper extracts:
- **Basic metadata**: title, meta description, canonical URL
- **Content structure**: H1, H2, H3 headings
- **Word count**: approximate content length
- **Links analysis**:
  - Internal links count
  - Outbound links count
  - Top 5 outbound domains
- **Forms summary**: field count, required fields, action URL
- **CTAs extraction**: button/link text + href + bounding box
- **Contact signals**: tel: links, mailto: links, forms

### 3. **Above-the-Fold Detection**
Uses Playwright bounding boxes to detect which CTAs are visible above the fold on:
- Desktop viewport (1280x720)
- Mobile viewport (375x667)

### 4. **Trust & Local Signals**
Deterministic extraction (no LLM) of:
- **Trust signals**: licensed, insured, certified, years in business, warranties, ratings
- **NAP data**: Name, Address, Phone (from JSON-LD and text)
- **Cities mentioned**: US city detection in content
- **JSON-LD blocks**: Raw structured data preservation

### 5. **Lighthouse Performance Audits**
Runs Lighthouse audits for top 3 pages:
- Home page
- Contact page
- Best service page

Metrics captured:
- Performance score
- Accessibility score
- SEO score
- Best practices score
- Core Web Vitals: FCP, LCP, CLS, TTI

### 6. **Screenshots**
Captures 3 screenshots per page (up to 5 pages):
- Desktop above-the-fold (1280x720)
- Desktop full page
- Mobile above-the-fold (375x667) - **Critical for local services**

## Database Schema

### `crawled_pages` Table
Stores detailed data for each crawled page:
```sql
CREATE TABLE crawled_pages (
  id INTEGER PRIMARY KEY,
  audit_job_id INTEGER,
  url TEXT,
  page_type TEXT,
  priority_score INTEGER,
  title TEXT,
  meta_description TEXT,
  h1_text TEXT,
  h2_json TEXT,
  h3_json TEXT,
  word_count INTEGER,
  internal_links_count INTEGER,
  outbound_links_count INTEGER,
  forms_count INTEGER,
  ctas_json TEXT,
  ctas_above_fold_json TEXT,
  has_tel_link INTEGER,
  has_form INTEGER,
  trust_signals_json TEXT,
  nap_json TEXT,
  cities_json TEXT,
  jsonld_blocks_json TEXT,
  screenshots_json TEXT,
  ...
)
```

### `lighthouse_reports` Table
Stores performance audit results:
```sql
CREATE TABLE lighthouse_reports (
  id INTEGER PRIMARY KEY,
  audit_job_id INTEGER,
  crawled_page_id INTEGER,
  url TEXT,
  page_type TEXT,
  performance_score REAL,
  accessibility_score REAL,
  seo_score REAL,
  fcp REAL,
  lcp REAL,
  cls REAL,
  report_json TEXT,
  ...
)
```

## How to Enable

### Step 1: Set Environment Variable
Add to your `.env` file:
```bash
USE_SCRAPER_V3=true
```

Or set in your hosting environment (e.g., Render.com):
```
USE_SCRAPER_V3=true
```

### Step 2: (Optional) Install Lighthouse
For full Lighthouse performance audits:
```bash
npm install lighthouse chrome-launcher
```

**Note**: Lighthouse is optional. If not installed, the scraper will skip Lighthouse audits and continue with all other features.

### Step 3: Restart Server
```bash
npm start
```

## Admin Interface

When Scraper v3 is enabled, the admin audit detail page will show a new **"B2) Pages Crawl"** section with:

### 1. Summary Stats
- Total pages crawled
- Pages with tel links
- Pages with forms
- Total CTAs above fold

### 2. Pages Table
Interactive table showing:
- Page number
- Page type (home, contact, services, etc.)
- URL
- Title
- CTA count
- Has tel link (✓/✗)
- Has form (✓/✗)
- Word count
- **Details button** (opens modal)

### 3. Page Details Modal
Click "Details" on any page to see:
- Full URL
- Title and H1
- Meta description
- Word count, internal/outbound links
- H2 headings list
- CTAs above the fold (with text and href)
- Forms summary (field count, required fields)
- Trust signals (licenses, ratings, years, etc.)
- NAP data (name, address, phone)
- Screenshots (desktop/mobile)

### 4. Lighthouse Reports
Visual cards showing:
- Performance score (color-coded)
- Accessibility score
- SEO score
- Best practices score
- Core Web Vitals (FCP, LCP)

## URL Blacklist Patterns

The scraper automatically skips:
- File types: `.pdf`, `.jpg`, `.png`, `.gif`, `.svg`, `.css`, `.js`, fonts
- Admin areas: `/wp-admin/`, `/wp-content/`, `/wp-includes/`
- Spam URLs: search queries, UTM parameters, Facebook/Google click IDs
- Archives: `/feed/`, `/tag/`, `/category/`, `/author/`, date archives
- Pagination: `/page/2`, `/page/3`, etc.

## Trust Signal Patterns

Automatically detects:
- `licensed` / `insured` / `certified`
- `X+ years` or `since YYYY` (years in business)
- `family owned`
- `warranty` / `guarantee`
- `BBB accredited`
- `X stars` (ratings)
- `X+ reviews` (review count)

## US Cities Detected

The scraper recognizes 32 major US cities for NAP extraction:
Miami, New York, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, Fort Worth, Columbus, Charlotte, Indianapolis, Seattle, Denver, Boston, Portland, Las Vegas, Detroit, Memphis, Nashville, Baltimore, Orlando, Tampa, Atlanta, Raleigh, Sacramento, Kansas City

## Backward Compatibility

Scraper v3 is **fully backward compatible** with existing LLM evaluators:
- Converts v3 multi-page data to v2 single-page format for LLM input
- Uses homepage data as the primary page
- Maintains existing Evidence Pack v2 structure
- Existing audit jobs continue to work without changes

## Performance Considerations

### Crawl Time
- ~2-5 seconds per page
- 50 pages = ~2-4 minutes total crawl time
- Lighthouse adds ~10-15 seconds per page (3 pages = ~30-45 seconds)

### Storage
- ~50-100 KB per crawled page (JSON + metadata)
- ~200-500 KB per screenshot set (3 images)
- 5 pages with screenshots = ~1-2 MB
- Lighthouse reports = ~100-200 KB each

### Recommendations
- Start with 10-20 pages for testing
- Enable screenshots for top 5 pages only (current default)
- Lighthouse is optional - disable if performance is critical

## Environment Variables Summary

```bash
# Enable Scraper v3 (required)
USE_SCRAPER_V3=true

# Optional: Adjust crawl limits (future)
# MAX_CRAWL_PAGES=50
# MAX_SCREENSHOT_PAGES=5
```

## Troubleshooting

### Issue: Scraper v3 not enabled
**Solution**: Check that `USE_SCRAPER_V3=true` is set in your environment and restart the server.

### Issue: Lighthouse failing
**Solution**: Lighthouse is optional. Install dependencies:
```bash
npm install lighthouse chrome-launcher
```

Or disable Lighthouse by not installing the packages - the scraper will continue without it.

### Issue: Slow crawling
**Solution**: 
1. Reduce MAX_URLS in `scraperV3.js` (default: 50)
2. Disable screenshots for most pages
3. Skip Lighthouse audits

### Issue: Missing pages in crawl
**Solution**:
1. Check if pages are in blacklist patterns
2. Verify pages are linked from homepage
3. Check if pages are same-origin (external links are skipped)

## Future Enhancements

Planned features for v3.1+:
- [ ] Configurable crawl depth and limits
- [ ] Custom blacklist/whitelist patterns per job
- [ ] Sitemap.xml parsing for discovery
- [ ] Screenshot comparison (before/after)
- [ ] Mobile viewport Lighthouse audits
- [ ] Accessibility tree analysis
- [ ] Custom trust signal patterns per niche

## API Reference

### `crawlWebsite(jobId, startUrl, logFn)`
Main crawler entry point.

**Parameters**:
- `jobId` (number): Audit job ID
- `startUrl` (string): Homepage URL to start crawling
- `logFn` (function): Logging function `(jobId, step, message) => Promise`

**Returns**: `Promise<Array<CrawledPage>>`

### `runLighthouseAudits(jobId, crawledPages, logFn)`
Runs Lighthouse for top 3 pages.

**Parameters**:
- `jobId` (number): Audit job ID
- `crawledPages` (Array): Crawled pages data
- `logFn` (function): Logging function

**Returns**: `Promise<Array<LighthouseReport>>`

## Support

For questions or issues with Scraper v3:
1. Check server logs for detailed error messages
2. Verify database schema is up to date
3. Check that Playwright is installed and working
4. Review admin audit detail page for crawl statistics

---

**Version**: 3.0.0  
**Last Updated**: 2026-01-15  
**Compatibility**: Node.js 16+, Playwright 1.47+

