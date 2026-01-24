# Test Plan: Dynamic City Detection

## Quick Test Checklist

### Test 1: San Francisco Business (JSON-LD)
**URL:** `https://empireplumbing.com/`

**Expected behavior:**
1. Scraper detekuje `addressLocality: "San Francisco"` z JSON-LD
2. Log zobrazí: `✓ Detected city from NAP data: San Francisco`
3. Veřejný audit zobrazí: "You're Invisible to **San Francisco** Customers"

**Steps:**
```bash
# Admin panel
1. Go to /admin/audits/new
2. Paste URL: https://empireplumbing.com/
3. Select niche: plumbing
4. Run audit
5. Check logs for city detection
6. Open public page - verify "San Francisco" appears
```

---

### Test 2: Generic Business (no city in JSON-LD)
**URL:** `https://example-small-business.com/`

**Expected behavior:**
1. Pokud není JSON-LD: zkusí detekovat z textu (cities_json)
2. Pokud ani to ne: fallback na `"your area"`
3. Log: `⚠ No city detected - using generic location: "your area"`

---

### Test 3: Manual City Override
**Expected behavior:**
1. Pokud admin vyplní city před spuštěním auditu
2. Scraper by NEMĚL přepisovat manuální hodnotu
3. ⚠️ **POZOR:** Aktuální implementace PŘEPÍŠE prázdné city, ale neřeší override
   - Pokud chceš umožnit manuální override, musíš přidat check

**Potential fix (if needed):**
```javascript
// V auditPipeline.js před city detection:
const cityWasManuallySet = (job.city && job.city.trim() !== '');

// Then check:
if (!cityWasManuallySet && homepage.nap_json && homepage.nap_json.city) {
  job.city = homepage.nap_json.city;
  // ...
}
```

---

## Manual Testing in Browser

### 1. Create New Audit
```
http://localhost:3000/admin/audits/new
```

### 2. Fill in:
- URL: `https://empireplumbing.com/`
- Niche: Plumbing
- City: (leave empty)

### 3. Run Audit & Check Logs
Look for:
```
✓ Detected city from NAP data: San Francisco
```

### 4. View Public Audit
```
http://localhost:3000/audit/{audit_id}
```

Check for:
- "You're Invisible to San Francisco Customers"
- "Stop losing plumbing customers to San Francisco competitors"
- etc.

---

## Automated Test (Optional)

Create test file: `tests/city-detection.test.js`

```javascript
const { extractNAP } = require('../server/services/scraperV3');

describe('City Detection', () => {
  test('should extract city from JSON-LD LocalBusiness', () => {
    const jsonldBlocks = [
      {
        '@type': 'LocalBusiness',
        name: 'Test Plumbing',
        address: {
          streetAddress: '123 Main St',
          addressLocality: 'San Francisco',
          addressRegion: 'CA',
          postalCode: '94102'
        },
        telephone: '555-1234'
      }
    ];

    const nap = extractNAP('test body text', jsonldBlocks);

    expect(nap.city).toBe('San Francisco');
    expect(nap.name).toBe('Test Plumbing');
    expect(nap.phone).toBe('555-1234');
  });

  test('should extract city from JSON-LD Organization', () => {
    const jsonldBlocks = [
      {
        '@type': 'Organization',
        name: 'Test Corp',
        address: {
          addressLocality: 'New York'
        }
      }
    ];

    const nap = extractNAP('', jsonldBlocks);

    expect(nap.city).toBe('New York');
  });

  test('should return null city if no addressLocality', () => {
    const jsonldBlocks = [
      {
        '@type': 'Organization',
        name: 'Test Corp'
      }
    ];

    const nap = extractNAP('', jsonldBlocks);

    expect(nap.city).toBeNull();
  });
});
```

---

## Edge Cases to Test

### 1. Multiple JSON-LD blocks
- Pokud jsou 2+ LocalBusiness/Organization bloky s různými městy
- **Expected:** Použije se první nalezené město

### 2. String vs Object address
```json
{
  "@type": "LocalBusiness",
  "address": "123 Main St, Miami, FL 33101"  // String format
}
```
- **Expected:** city = null (funkce hledá jen object.addressLocality)
- **Možné zlepšení:** Parsovat string pomocí regex

### 3. Empty addressLocality
```json
{
  "address": {
    "addressLocality": ""
  }
}
```
- **Expected:** city = null nebo fallback

### 4. City in different language/format
```json
{
  "addressLocality": "San José"  // With accent
}
```
- **Expected:** Mělo by fungovat (slice(0,100) zachová accent)

---

## Production Checklist

Before deploying:

- [ ] Test with 3+ real business URLs from different cities
- [ ] Verify logs show correct detection
- [ ] Check public audit page displays correct city
- [ ] Verify fallback to "your area" works when no city detected
- [ ] Test that existing audits (with Miami) still work
- [ ] Check LLM outputs use correct city in text generation
- [ ] Review assistant outputs for city-specific context

---

## Known Limitations

1. **Small cities not in US_CITIES list:**
   - `cities_json` fallback won't work
   - Will use "your area" fallback

2. **International businesses:**
   - US_CITIES list only contains US cities
   - International cities won't be detected from text
   - JSON-LD addressLocality will still work

3. **Multiple locations:**
   - If business has multiple locations, uses first detected
   - No multi-city support

4. **Manual override:**
   - Current implementation doesn't preserve manually-set city
   - See "Test 3" above for fix

---

## Rollback Plan

If issues arise:

```bash
git revert HEAD  # Revert city detection changes
```

Or manually restore hardcoded Miami:
```javascript
// server/services/auditPipeline.js line ~2769
job.city = 'Miami'; // Default fallback
```
