# City Detection Flow - Vizuální Přehled

## Celkový tok

```
┌─────────────────────────────────────────────────────────────────┐
│                      Nový Audit Vytvoření                        │
│                      (city = "" - prázdné)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SCRAPER V3 CRAWLING                           │
│                   crawlWebsite(jobId, url)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Homepage Data Extraction                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  extractNAP(bodyText, jsonldBlocks)                      │   │
│  │                                                           │   │
│  │  1. Hledá JSON-LD blocks:                                │   │
│  │     - @type: "LocalBusiness"                             │   │
│  │     - @type: "Organization"                              │   │
│  │                                                           │   │
│  │  2. Extrahuje address.addressLocality                    │   │
│  │     ↓                                                     │   │
│  │  nap.city = addressLocality                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  extractCities(bodyText)                                 │   │
│  │                                                           │   │
│  │  Hledá zmínky měst v textu stránky:                      │   │
│  │  - US_CITIES list (Miami, New York, LA, ...)            │   │
│  │     ↓                                                     │   │
│  │  cities_json = ["Miami", "Fort Lauderdale"]              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              CITY DETECTION PIPELINE (3-Step)                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ STEP 1: Check NAP Data                                     │ │
│  │                                                             │ │
│  │ if (homepage.nap_json.city)                                │ │
│  │   ✓ job.city = homepage.nap_json.city                      │ │
│  │   LOG: "✓ Detected city from NAP data: San Francisco"     │ │
│  └──────────────────┬──────────────────────────────────────────┘ │
│                     │ No city found?                             │
│                     ▼                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ STEP 2: Check Cities Mentioned in Text                     │ │
│  │                                                             │ │
│  │ if (homepage.cities_json.length > 0)                       │ │
│  │   ✓ job.city = homepage.cities_json[0]                     │ │
│  │   LOG: "✓ Detected city from page text: Miami"            │ │
│  └──────────────────┬──────────────────────────────────────────┘ │
│                     │ Still no city?                             │
│                     ▼                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ STEP 3: Generic Fallback                                   │ │
│  │                                                             │ │
│  │ if (!job.city)                                             │ │
│  │   ⚠ job.city = "your area"                                │ │
│  │   LOG: "⚠ No city detected - using generic location"      │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATE DATABASE                               │
│              updateJob(jobId, { city: "..." })                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LLM ASSISTANT PIPELINE                          │
│        (používá job.city z databáze v promptech)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VIEW MODEL GENERATION                         │
│           vm.hero.city = job.city                                │
│           vm.seo_local.city = job.city                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PUBLIC AUDIT RENDERING                           │
│  "You're Invisible to <%= vm.hero.city %> Customers"             │
│                                                                  │
│  Výstup: "You're Invisible to San Francisco Customers"          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Priority Detekce (Od nejvyšší)

```
┌──────────────────────────────────────────────────────────┐
│  Priority 1: JSON-LD addressLocality                     │
│  ═══════════════════════════════════════════════════     │
│                                                           │
│  Zdroj: <script type="application/ld+json">              │
│  Spolehlivost: ★★★★★                                     │
│  Proč: Strukturovaná data přímo od firmy                 │
│                                                           │
│  Příklad:                                                 │
│  {                                                        │
│    "@type": "LocalBusiness",                             │
│    "address": {                                          │
│      "addressLocality": "San Francisco"  ← TOTO          │
│    }                                                      │
│  }                                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Priority 2: Cities in Page Text                         │
│  ─────────────────────────────────────────────────       │
│                                                           │
│  Zdroj: bodyText (viditelný text na stránce)             │
│  Spolehlivost: ★★★☆☆                                     │
│  Proč: Může být zmíněno víc měst, není vždy reliable     │
│                                                           │
│  Příklad:                                                 │
│  "Serving Miami, Fort Lauderdale, and West Palm Beach"   │
│           ↑ použije se první (Miami)                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Priority 3: Generic Fallback                            │
│  ─────────────────────────────────────────────────       │
│                                                           │
│  Hodnota: "your area"                                    │
│  Spolehlivost: N/A (fallback)                            │
│  Proč: Když selžou všechny detekce                       │
│                                                           │
│  Output:                                                  │
│  "You're Invisible to your area Customers"               │
│  (stále gramaticky správné)                              │
└──────────────────────────────────────────────────────────┘
```

---

## Příklady JSON-LD Patterns

### ✅ Pattern 1: LocalBusiness (nejčastější)
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Empire Plumbing",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "San Francisco",  ← DETEKUJE
    "addressRegion": "CA",
    "postalCode": "94102"
  }
}
```
**Result:** `city = "San Francisco"`

---

### ✅ Pattern 2: Organization
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Smith & Co",
  "address": {
    "addressLocality": "New York"  ← DETEKUJE
  }
}
```
**Result:** `city = "New York"`

---

### ✅ Pattern 3: Multiple blocks (uses first)
```json
[
  {
    "@type": "Organization",
    "address": { "addressLocality": "Miami" }  ← POUŽIJE TOTO
  },
  {
    "@type": "LocalBusiness",
    "address": { "addressLocality": "Orlando" }
  }
]
```
**Result:** `city = "Miami"` (první nalezené)

---

### ❌ Pattern 4: String address (NEDETEKUJE)
```json
{
  "@type": "LocalBusiness",
  "address": "123 Main St, Miami, FL 33101"  ← String - SKIP
}
```
**Result:** `city = null` → fallback na cities_json nebo "your area"

**Možné zlepšení:** Přidat regex parsing pro string adresy

---

## Co se děje v různých scénářích

### Scénář A: Perfektní data ✅
```
Input URL: https://empireplumbing.com/
JSON-LD: ✓ addressLocality: "San Francisco"
Page text: "Serving San Francisco since 1990"

→ STEP 1: ✓ NAP data
→ Result: city = "San Francisco"
→ Log: "✓ Detected city from NAP data: San Francisco"
```

---

### Scénář B: Chybí JSON-LD ⚠️
```
Input URL: https://small-plumber.com/
JSON-LD: ✗ (chybí)
Page text: "Licensed plumber in Miami, FL"

→ STEP 1: ✗ No NAP city
→ STEP 2: ✓ Found "Miami" in text
→ Result: city = "Miami"
→ Log: "✓ Detected city from page text: Miami"
```

---

### Scénář C: Žádná detekce ⚠️
```
Input URL: https://generic-website.com/
JSON-LD: ✗ (chybí)
Page text: "Best service nationwide"

→ STEP 1: ✗ No NAP city
→ STEP 2: ✗ No cities found
→ STEP 3: ✓ Fallback
→ Result: city = "your area"
→ Log: "⚠ No city detected - using generic location"
```

---

### Scénář D: Malé město (ne v US_CITIES) ⚠️
```
Input URL: https://smalltown-plumbing.com/
JSON-LD: ✓ addressLocality: "Smallville"
Page text: "Serving Smallville, KS"

→ STEP 1: ✓ NAP data (JSON-LD má přednost!)
→ Result: city = "Smallville"
→ Log: "✓ Detected city from NAP data: Smallville"

Note: cities_json by byl prázdný (Smallville není v US_CITIES),
ale JSON-LD zachrání situaci!
```

---

## Database Schema

```sql
audit_jobs {
  id: INTEGER
  input_url: TEXT
  niche: TEXT
  city: TEXT  ← Toto pole se nyní automaticky vyplňuje
  ...
}

-- Příklad row před:
{ id: 123, city: "Miami" }  ← Hardcoded

-- Příklad row po:
{ id: 124, city: "San Francisco" }  ← Auto-detected
{ id: 125, city: "New York" }       ← Auto-detected
{ id: 126, city: "your area" }      ← Fallback
```

---

## Logs Monitoring

Při spuštění auditu sleduj tyto logy:

```bash
# Success - NAP detection
✓ Detected city from NAP data: San Francisco

# Success - Text detection
✓ Detected city from page text: Miami

# Warning - Fallback
⚠ No city detected - using generic location: "your area"
```

**Kde hledat logy:**
- Admin panel: `/admin/audits/{id}` → Log výpis
- Server console: `npm run dev` output
- Database: `audit_jobs.logs_json`

---

## Důsledky v UI

### Před (hardcoded Miami):
```
"You're Invisible to Miami Customers Everywhere."
"Stop losing plumbing customers to Miami competitors."
```

### Po (dynamické):
```
"You're Invisible to San Francisco Customers Everywhere."
"Stop losing plumbing customers to San Francisco competitors."

nebo

"You're Invisible to your area Customers Everywhere."
"Stop losing plumbing customers to your area competitors."
```

---

## Shrnutí změn v kódu

| Soubor | Změna | Důvod |
|--------|-------|-------|
| `scraperV3.js` | +city field v NAP | Extrakce addressLocality |
| `auditPipeline.js` | +city detection logic | 3-step cascade detection |
| `promptTemplates.js` | -"Miami" hardcode | Dynamic city z evidence |
| `assistantPrompts.js` | -"Miami" hardcode | Dynamic city context |
| `admin.js` | city: '' místo 'Miami' | Auto-detect místo default |

---

## Performance Impact

**Nulový impact** - detekce běží už během normálního scrapingu:
- extractNAP() - už běžela, jen +1 field
- extractCities() - už běžela
- Nové: jen 3 if-checks v pipeline (< 1ms)
