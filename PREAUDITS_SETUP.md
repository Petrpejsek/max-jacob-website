# Preaudits System - Setup Guide

## Overview

The Preaudits system automatically searches for businesses on Google/Bing, validates email presence, and converts quality results into audits.

## Features

- 🔍 **Automated Search** - Google/Bing API via Serper.dev
- ✉️ **Email Detection** - Multi-method email discovery (regex, DOM, mailto, /contact page)
- 📸 **Screenshot Capture** - Hero + fullpage screenshots for validation
- 🚫 **Smart Blacklist** - Automatically filters sites without emails
- ✅ **One-Click Convert** - Transform validated results into audits

## Setup Instructions

### 1. Get Serper.dev API Key

1. Go to [Serper.dev](https://serper.dev/)
2. Sign up for free account (2,500 searches/month FREE)
3. Get your API key from dashboard

### 2. Add API Key to Environment

**Local Development (.env file):**
```env
SERPER_API_KEY=your_serper_api_key_here
```

**Production (Render.com):**
1. Go to your Render dashboard
2. Navigate to your service → Environment
3. Add environment variable:
   - Key: `SERPER_API_KEY`
   - Value: `your_serper_api_key_here`
4. Save and redeploy

### 3. Verify Installation

1. Start your server: `npm run dev`
2. Navigate to: `http://localhost:3000/admin/preaudits`
3. You should see the Preaudits interface

## Usage

### Basic Workflow

1. **Input Form**
   - Select **Niche** (e.g., Plumbing)
   - Enter **City** (optional, e.g., Miami)
   - Set **Count** (number of results, 1-50)
   - Click **Process**

2. **Automated Processing**
   - System searches Google/Bing
   - Visits each website
   - Detects emails using 4 methods
   - Takes screenshots (if email found)
   - Categorizes as GREEN (✓ email) or RED (✗ no email)

3. **Review Results**
   - **GREEN Results**: Valid sites with emails
     - View screenshot preview
     - Click to see fullpage screenshot
     - Click **Proceed** to convert to audit
     - Click **Delete** to blacklist
   - **RED Results**: Sites without emails (auto-blacklisted)

4. **Convert to Audit**
   - Click **Proceed** on any GREEN result
   - System creates audit job with:
     - ✓ URL pre-filled
     - ✓ Niche pre-filled
     - ✓ City pre-filled
     - ✓ Status: **READY TO CHECK** (highlighted in audits list)

### Search Examples

**Example 1: Local Business**
- Niche: `plumbing`
- City: `Miami`
- Count: `10`
→ Finds 10 plumbing businesses in Miami with emails

**Example 2: National Search**
- Niche: `plumbing`
- City: *(leave empty)*
- Count: `20`
→ Finds 20 plumbing businesses across USA with emails

**Example 3: Different Niche**
- Niche: `roofing`
- City: `Los Angeles`
- Count: `15`
→ Finds 15 roofing businesses in LA with emails

## How Email Detection Works

The system uses **4 detection methods** in order:

1. **mailto: Links** (fastest)
   - Scans for `<a href="mailto:...">` links
   
2. **DOM Sections** (reliable)
   - Searches footer, header, contact sections
   
3. **HTML Regex** (comprehensive)
   - Pattern matching across entire page
   - Handles obfuscated emails ([at], [dot])
   
4. **Contact Page** (last resort)
   - Crawls `/contact`, `/contact-us` pages
   - Same detection methods applied

**If ANY method finds an email → GREEN result**
**If NO email found → RED result (blacklisted)**

## Blacklist System

- **Global blacklist** - URLs without emails are never searched again
- **Automatic** - No manual intervention needed
- **Persistent** - Survives server restarts
- **Manual add** - Delete button on GREEN results adds to blacklist

## Technical Details

### Performance

- **Search API**: Serper.dev (1 second response)
- **Email Detection**: 5-15 seconds per site
- **Screenshots**: 2-3 seconds per site
- **Delay**: 3 seconds between sites (ban prevention)

**Estimated time for 10 results: 2-3 minutes**

### Storage

- **Screenshots**: `/public/preaudit_screenshots/{search_id}/`
- **Database**: SQLite tables `preaudit_searches`, `preaudit_results`, `preaudit_blacklist`

### Rate Limits

- **Serper.dev Free**: 2,500 searches/month
- **Serper.dev Paid**: $5 per 1,000 searches
- **Built-in delays**: 3 seconds between pages (no ban risk)

## Troubleshooting

### "SERPER_API_KEY not configured"
→ Add API key to `.env` file (see Setup step 2)

### "Search failed after 3 attempts"
→ Check API key validity at serper.dev dashboard

### No emails found (all RED results)
→ Normal for some niches/cities. Try different search terms.

### Screenshots not loading
→ Check `/public/preaudit_screenshots/` directory exists and is writable

### "Audit job created" but not visible
→ Go to `/admin/audits` and look for **READY TO CHECK** badge

## API Endpoints

```
GET  /admin/preaudits                     - Main UI page
POST /admin/api/preaudits/search          - Start search
GET  /admin/api/preaudits/:id/status      - Poll status
GET  /admin/api/preaudits/:id/results     - Get results
POST /admin/api/preaudits/:id/proceed     - Convert to audit
DELETE /admin/api/preaudits/:id           - Delete result
```

## Database Schema

```sql
-- Search history
preaudit_searches (id, niche, city, requested_count, found_count, green_count, red_count, status)

-- Individual results
preaudit_results (id, search_id, url, title, email, has_email, screenshot_hero_path, screenshot_full_path, status)

-- Blacklist (no emails)
preaudit_blacklist (id, url, niche, city, reason)
```

## Next Steps

1. **Test locally** with a small count (3-5 results)
2. **Verify screenshots** are saving correctly
3. **Try "Proceed"** to create an audit
4. **Check audit list** for READY TO CHECK badge
5. **Deploy to production** (Render automatically picks up .env changes)

## Support

Need help? Check:
- Server logs for detailed error messages
- Serper.dev dashboard for API usage
- `/admin/diagnostics` for system health

---

**Ready to use!** Navigate to `/admin/preaudits` and start searching. 🚀
