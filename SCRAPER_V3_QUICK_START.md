# Scraper v3 Quick Start Guide

## Enable Scraper v3 in 3 Steps

### 1. Add Environment Variable
```bash
# In your .env file or hosting environment
USE_SCRAPER_V3=true
```

### 2. (Optional) Install Lighthouse
```bash
npm install lighthouse chrome-launcher
```
Skip this if you don't need performance audits.

### 3. Restart Server
```bash
npm start
```

## What You Get

### ✅ **Multi-Page Crawling**
- Up to 50 pages from the same domain
- Smart prioritization (contact/services/reviews first)
- Automatic blacklist (PDFs, admin pages, spam)

### ✅ **Rich Data Extraction**
Per page:
- Title, meta, headings (H1-H3)
- Word count
- Internal/outbound links
- Forms + CTAs
- Trust signals (licensed, insured, years, ratings)
- NAP (Name, Address, Phone)
- Cities mentioned
- JSON-LD structured data

### ✅ **Above-the-Fold Detection**
- Desktop (1280x720)
- Mobile (375x667)
- CTA visibility tracking using Playwright bounding boxes

### ✅ **Screenshots** (top 5 pages)
- Desktop above-fold
- Desktop full page
- **Mobile above-fold** (key for local services!)

### ✅ **Lighthouse Audits** (top 3 pages, optional)
- Performance score
- Accessibility score
- SEO score
- Core Web Vitals (FCP, LCP, CLS, TTI)

### ✅ **New Admin UI**
- **Pages Crawl** tab with interactive table
- Page details modal (click "Details" on any row)
- Lighthouse reports visualization
- Summary stats dashboard

## Admin Interface Preview

### Summary Stats
```
Pages Crawled: 47
Pages with Tel Link: 23
Pages with Forms: 3
Total CTAs Above Fold: 142
```

### Pages Table
| # | Type     | URL                  | Title               | CTAs | Tel | Form | Words |
|---|----------|----------------------|---------------------|------|-----|------|-------|
| 1 | home     | example.com          | Home - Company      | 8    | ✓   | ✓    | 1,234 |
| 2 | contact  | example.com/contact  | Contact Us          | 3    | ✓   | ✓    | 456   |
| 3 | services | example.com/services | Our Services        | 5    | ✓   | ✗    | 2,100 |

### Lighthouse Reports
```
Home Page
- Performance: 92 (green)
- Accessibility: 87 (yellow)
- SEO: 95 (green)
- FCP: 1.2s, LCP: 2.4s

Contact Page
- Performance: 88 (yellow)
- Accessibility: 91 (green)
- SEO: 93 (green)
- FCP: 1.4s, LCP: 2.8s
```

## Backward Compatibility

✅ **Fully compatible** with existing audits  
✅ Scraper v2 still works if v3 is not enabled  
✅ LLM evaluators work with both v2 and v3 data  
✅ No changes to existing audit jobs

## Performance

### Crawl Time
- ~2-5 seconds per page
- 50 pages = ~2-4 minutes
- Lighthouse (3 pages) = +30-45 seconds

### Storage
- ~50-100 KB per page (JSON)
- ~500 KB per screenshot set
- Total: ~5-10 MB for 50 pages with screenshots

## Troubleshooting

### Not seeing Pages Crawl tab?
1. Check `USE_SCRAPER_V3=true` is set
2. Restart server
3. Run a new audit (existing audits won't have v3 data)

### Lighthouse not working?
```bash
npm install lighthouse chrome-launcher
```
Or just skip it - Scraper v3 works fine without Lighthouse.

### Slow crawling?
Edit `server/services/scraperV3.js`:
```javascript
const MAX_URLS = 20; // Reduce from 50
```

## Example Output

### Trust Signals Found
- `licensed` (from: "Licensed and Insured Plumbers")
- `years_experience` (from: "20+ years of experience")
- `bbb_accredited` (from: "BBB Accredited Business")
- `star_rating` (from: "4.9 stars on Google")

### NAP Extraction
- **Name**: ABC Plumbing Services
- **Address**: 123 Main St, Miami, FL 33101
- **Phone**: (305) 555-1234

### Cities Detected
Miami, Fort Lauderdale, Hollywood, Coral Gables, Hialeah

## Next Steps

1. **Enable v3**: Set `USE_SCRAPER_V3=true` and restart
2. **Run an audit**: Use admin panel to process a website
3. **View results**: Click on audit → see "B2) Pages Crawl" section
4. **Click "Details"**: Explore individual page data
5. **Review Lighthouse**: Check performance scores

## Full Documentation

See `SCRAPER_V3_GUIDE.md` for complete details.

---

**Questions?** Check server logs for detailed crawl progress.  
**Issues?** Scraper v3 is optional - v2 remains the default if not enabled.

