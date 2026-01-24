# NO FALLBACKS - Show Truth or Error

## Filosofie
❌ **PŘED:** Schovávat chybějící data za generic fallbacky ("your area", "Miami", "service")  
✅ **PO:** Ukázat pravdu nebo hodit chybu - žádné fake data

---

## Odstraněné Fallbacky

### 1. ❌ City Fallbacks (5x)

#### auditPipeline.js
```javascript
// PŘED:
job.city = 'your area'; // Generic fallback
job.city = 'Miami'; // Hardcoded fallback

// PO:
if (!job.city || job.city.trim() === '') {
  throw new Error('City detection failed - no addressLocality in JSON-LD and no cities found in page text. Cannot proceed without location data.');
}
```

**Locations:**
- Line ~2836: V3 scraper path - removed 'your area' fallback
- Line ~3029: V2 scraper path - removed 'your area' fallback  
- Line ~2556: `generatePublicSlug()` - removed 'miami' fallback, now throws error
- `auditViewModelV2.js` line ~107: Removed 'your area' fallback
- `auditViewModelV2.js` line ~167: Removed empty string fallback

**Impact:**
- Audit **FAILS** if city cannot be detected → forces fixing scraper
- No more audits showing wrong city
- Logs show clear error: `❌ ERROR: No city detected from scraped data`

---

### 2. ❌ Niche Fallbacks (2x)

#### admin.js
```javascript
// PŘED:
niche: 'plumbing', // Default when creating new audit

// PO:
niche: '', // Empty - MUST be selected before running
```

#### auditViewModelV2.js
```javascript
// PŘED:
const niche = job.niche || 'service';

// PO:
if (!job.niche || job.niche.trim() === '') {
  throw new Error('Cannot generate audit view model without niche - niche must be set before running audit');
}
const niche = job.niche;
```

**Impact:**
- Cannot run audit without selecting niche
- No more generic "service" audits
- Forces user to pick niche from preset

---

### 3. ❌ Mini Audit Generic Fallbacks

#### auditViewModelV2.js - Positive Findings
```javascript
// PŘED:
if (well.length === 0) {
  well.push({ text: 'Website is live and accessible.' });
  well.push({ text: 'Basic company information is present.' });
}

// PO:
if (well.length === 0) {
  throw new Error('Cannot build mini audit - no positive findings detected. Check scraper extracted data.');
}
```

#### auditViewModelV2.js - Friction Points
```javascript
// PŘED:
if (unclear.length < 3) {
  unclear.push({ text: 'Outdated Design: Visitors perceive...' });
}

// PO:
if (unclear.length < 2) {
  throw new Error('Cannot build mini audit - insufficient friction points detected (< 2). Check UX audit output.');
}
```

**Impact:**
- Audit fails if scraper doesn't extract enough data
- Forces improving scraper quality
- No more generic fluff text

---

### 4. ❌ Preset Default City Override

#### auditPipeline.js
```javascript
// PŘED:
if (preset.default_city) {
  updates.city = preset.default_city; // Overrides scraped city!
}

// PO:
// REMOVED: preset.default_city override
// City must ALWAYS be detected from scraped data
```

**Impact:**
- Preset cannot override auto-detected city
- Every audit shows REAL city from business website
- `preset.default_city` field is now ignored (can be removed from DB later)

---

## Error Messages (New)

### City Detection Failed
```
Error: City detection failed - no addressLocality in JSON-LD and no cities found in page text. Cannot proceed without location data.
```

**When:** Scraper can't find city in JSON-LD or page text  
**Fix:** Check website has JSON-LD with addressLocality OR add city to US_CITIES list

---

### Niche Not Set
```
Error: Niche is required - please select a preset
```

**When:** Trying to run audit without selecting niche  
**Fix:** Select niche/preset in admin panel before running

---

### Slug Generation Failed
```
Error: Cannot generate slug without niche (undefined) and city (undefined)
```

**When:** Missing niche or city when generating public URL  
**Fix:** Ensure both are set before generating public page

---

### View Model Failed
```
Error: Cannot generate audit view model without city - city detection failed during scraping
```

**When:** Trying to render public page without city  
**Fix:** City must be detected during scraping phase

---

### Mini Audit Failed
```
Error: Cannot build mini audit - no positive findings detected. Check scraper extracted data.
```

**When:** Scraper didn't extract any positive data (name, contact, services)  
**Fix:** Improve scraper or check website quality

---

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `server/services/auditPipeline.js` | - Removed 'your area' fallbacks (2x)<br>- Removed 'miami' fallback in slug<br>- Removed preset.default_city override<br>- Added city validation errors | ~2556, ~2757, ~2773, ~2836, ~3029 |
| `server/helpers/auditViewModelV2.js` | - Removed niche fallback<br>- Removed city fallbacks (2x)<br>- Removed mini audit generic texts | ~107, ~167, ~299, ~330 |
| `server/routes/admin.js` | - Changed default niche from 'plumbing' to '' | ~177 |
| `server/services/scraperV3.js` | - Added string address city parsing<br>- Added city extraction from NAP | ~805-820, ~845-852 |

**Total:** 4 files, ~15 locations

---

## Before vs After

### Scenario 1: Amy's Plumbing (Fort Lauderdale)

#### PŘED:
```
JSON-LD: address = "..., Fort Lauderdale, FL, ..."
Extract: city = null (string parsing not implemented)
Fallback: city = "Miami" ❌
Audit: "You're Invisible to Miami Customers" ❌
```

#### PO:
```
JSON-LD: address = "..., Fort Lauderdale, FL, ..."
Extract: city = "Fort Lauderdale" (regex parser) ✅
Audit: "You're Invisible to Fort Lauderdale Customers" ✅
```

---

### Scenario 2: Website bez JSON-LD

#### PŘED:
```
JSON-LD: missing
cities_json: []
Fallback: city = "your area" ❌
Audit: "You're Invisible to your area Customers" ❌
```

#### PO:
```
JSON-LD: missing
cities_json: []
ERROR: City detection failed ✅
Audit: NOT GENERATED (fails early) ✅
```

**Result:** Forces adding city to page or JSON-LD

---

### Scenario 3: Preset s default_city

#### PŘED:
```
Scraped city: "Fort Lauderdale"
Preset default_city: "Miami"
Result: city = "Miami" ❌ (preset overrode scraped!)
```

#### PO:
```
Scraped city: "Fort Lauderdale"
Preset default_city: "Miami" (ignored)
Result: city = "Fort Lauderdale" ✅
```

---

### Scenario 4: Nový audit bez niche

#### PŘED:
```
User creates audit, leaves niche empty
System: niche = "plumbing" (default)
Audit runs with wrong niche ❌
```

#### PO:
```
User creates audit, leaves niche empty
System: niche = ""
User clicks "Run Audit"
ERROR: "Niche is required - please select a preset" ✅
```

---

## Validation Flow

### Audit Start Validation:
```
1. ✅ URL required → Error if empty
2. ✅ Niche required → Error if empty
3. ⏳ City optional → Will be detected OR error
```

### After Scraping Validation:
```
1. ✅ City detected? → Continue
2. ❌ City missing? → ERROR, stop audit
```

### Before Public Page Generation:
```
1. ✅ City exists? → Generate view model
2. ❌ City missing? → ERROR "Cannot generate view model without city"
3. ✅ Niche exists? → Generate view model
4. ❌ Niche missing? → ERROR "Cannot generate view model without niche"
```

---

## Benefits

### ✅ Data Integrity
- No more fake/generic data in audits
- Every field is real or audit fails
- Easy to spot missing scraper features

### ✅ Debugging
- Clear error messages point to exact problem
- Failed audits show what data is missing
- Logs show detection attempts

### ✅ Quality Control
- Forces fixing scraper issues
- Forces better website data
- No hiding problems behind fallbacks

### ✅ Personalization
- Every audit is 100% personalized
- No generic "your area" or "service" language
- Real city names, real business names

---

## Testing Checklist

Before restart, verify:

### Test 1: Amy's Plumbing (string address)
- [ ] URL: https://amysplumbing.com/
- [ ] Expected: city = "Fort Lauderdale"
- [ ] Log: `✓ Detected city from NAP data: Fort Lauderdale`

### Test 2: Empire Plumbing (object address)
- [ ] URL: https://empireplumbing.com/
- [ ] Expected: city = "San Francisco"  
- [ ] Log: `✓ Detected city from NAP data: San Francisco`

### Test 3: Generic website (no city data)
- [ ] URL: https://example.com/
- [ ] Expected: ERROR
- [ ] Log: `❌ ERROR: No city detected from scraped data`

### Test 4: Create audit without niche
- [ ] Create new audit
- [ ] Leave niche empty
- [ ] Click "Run Audit"
- [ ] Expected: ERROR "Niche is required - please select a preset"

### Test 5: Preset doesn't override city
- [ ] Create audit with preset (has default_city)
- [ ] Run audit on Fort Lauderdale business
- [ ] Expected: city = "Fort Lauderdale" (NOT preset default)

---

## Migration Impact

### Existing Audits
✅ **NO IMPACT**
- Already have city/niche in database
- View model generation still works
- Public pages still render

### New Audits
⚠️ **WILL FAIL** if:
- Website has no city in JSON-LD
- Website has no city mentions in text
- Niche not selected before running

**This is GOOD** - forces data quality!

---

## Rollback Plan

If too many audits fail:

```bash
# Revert all changes:
git revert HEAD~2  # Reverts last 2 commits

# Or manual restore one fallback:
# In auditPipeline.js ~2836:
job.city = job.city || 'your area';
```

**But better:** Fix the root cause (improve scraper, add cities to US_CITIES, fix websites)

---

## Next Steps After Restart

1. **Run 5-10 test audits** on real businesses
2. **Monitor error logs** - what fails?
3. **Improve scraper** based on failures
4. **Expand US_CITIES** list if needed
5. **Add better error UI** in admin panel

---

## Philosophy Reminder

> "Fallbacks schovávají problémy. Chyby odhalují problémy.  
> Raději 10 failed auditů které odhalí co chybí,  
> než 100 successful auditů s fake daty."

❌ "your area" = lie  
✅ ERROR = truth
