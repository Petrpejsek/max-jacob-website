# Dynamic City Detection - Implementation Summary

## Problém
V auditovacím systému byla natvrdo nastavená "Miami" jako město, ale firmy mohou být z různých měst. Město musí být automaticky detekováno ze scrapovaných dat.

## Řešení

### 1. **Scraper v3 - Extrakce města z NAP dat**
**Soubor:** `server/services/scraperV3.js`

- Rozšířená funkce `extractNAP()` o extrakci města
- Nové pole `city` v NAP objektu
- Město se extrahuje z `addressLocality` v JSON-LD structured data (LocalBusiness/Organization)

```javascript
// Nyní extrahuje:
{
  name: "...",
  address: "...",
  phone: "...",
  city: "San Francisco"  // ← NOVÉ
}
```

**Zdroje dat (v pořadí priority):**
1. JSON-LD `LocalBusiness.address.addressLocality`
2. JSON-LD `Organization.address.addressLocality`

---

### 2. **Audit Pipeline - Automatická detekce města**
**Soubor:** `server/services/auditPipeline.js`

#### Scraper V3 Path (hlavní):
Po scrapování homepage se město detekuje v tomto pořadí:

1. **Z NAP dat** (`homepage.nap_json.city`)
   - Extrahováno z JSON-LD addressLocality
   - Log: `✓ Detected city from NAP data: {city}`

2. **Z textu na stránce** (`homepage.cities_json[0]`)
   - Seznam měst nalezených v textu
   - Použije se první nalezené
   - Log: `✓ Detected city from page text: {city}`

3. **Generický fallback** (`"your area"`)
   - Použije se pouze pokud detekce selhala
   - Log: `⚠ No city detected - using generic location: "your area"`

#### Scraper V2 Path (legacy):
Podobná logika s využitím `jsonld_extracted_json.localbusiness.address.addressLocality`

**Kód:**
```javascript
// V3 path - po line 2820
if ((!job.city || job.city.trim() === '') && homepage.nap_json && homepage.nap_json.city) {
  job.city = homepage.nap_json.city;
  await updateJob(jobId, { city: homepage.nap_json.city });
  await logStep(jobId, 'scrape', `✓ Detected city from NAP data: ${job.city}`);
}

// Fallback: cities_json
if ((!job.city || job.city.trim() === '') && homepage.cities_json && homepage.cities_json.length > 0) {
  job.city = homepage.cities_json[0];
  await updateJob(jobId, { city: job.city });
  await logStep(jobId, 'scrape', `✓ Detected city from page text: ${job.city}`);
}

// Final fallback
if (!job.city || job.city.trim() === '') {
  job.city = 'your area';
  await updateJob(jobId, { city: job.city });
  await logStep(jobId, 'scrape', `⚠ No city detected - using generic location: "${job.city}"`);
}
```

---

### 3. **LLM Prompty - Odstranění hardcoded Miami**
**Soubory:**
- `server/services/promptTemplates.js`
- `server/services/assistantPrompts.js`

**Změny:**
- ~~"Miami local business audit"~~ → "local business audit"
- ~~"Miami local, friendly..."~~ → "Local context, friendly... (use city from evidence_pack.city)"
- Prompty nyní respektují dynamické město z `evidence_pack.city`

---

### 4. **Admin Routes - Prázdné město pro nové audity**
**Soubor:** `server/routes/admin.js`

**Před:**
```javascript
city: 'Miami'
```

**Po:**
```javascript
city: '' // Empty - will be auto-detected from scraped data
```

Nové audity se vytváří s prázdným městem, které se automaticky vyplní při scrapování.

---

## Jak to funguje v praxi

### Příklad 1: Firma s kompletním JSON-LD
```html
<script type="application/ld+json">
{
  "@type": "LocalBusiness",
  "name": "Empire Plumbing",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "San Francisco",  ← DETEKUJE SE
    "addressRegion": "CA",
    "postalCode": "94102"
  }
}
</script>
```

**Výsledek:** `job.city = "San Francisco"`

---

### Příklad 2: Firma bez JSON-LD, město v textu
Web obsahuje text: "Serving New York since 1990..."

**Výsledek:** `job.city = "New York"` (z cities_json)

---

### Příklad 3: Žádná detekce
Web nemá JSON-LD ani zmínku o městu v textu.

**Výsledek:** `job.city = "your area"` (generický fallback)

---

## View Model v Audit Template

Audity v `audit-public-v2.ejs` už používají dynamické město:
```html
<h2>You're Invisible to <%= vm.hero.city %> Customers Everywhere.</h2>
```

**vm.hero.city** se naplní z `job.city`, které je nyní automaticky detekované.

---

## Testování

### Manuální test:
1. Vytvoř nový audit v admin panelu
2. Zadej URL firmy z jiného města (ne Miami)
3. Spusť scraping
4. Zkontroluj logs - měl by se objevit: `✓ Detected city from NAP data: {city}`
5. Otevři veřejný audit - měl by zobrazovat správné město v celém textu

### Příklady testovacích URL:
- **San Francisco**: https://empireplumbing.com/
- **New York**: https://anyplumbingnyc.com/
- **Chicago**: https://chicagoplumbingexperts.com/

---

## Důsledky změn

✅ **Pozitivní:**
- Audity jsou nyní city-aware
- Automatická detekce - žádný manuální vstup
- Funguje pro firmy z celých USA
- Fallback na "your area" je přívětivý

⚠️ **Poznámky:**
- Test soubory (`tests/evidence-pack-*.test.js`) stále používají Miami - to je OK, jsou to fixtures
- Scraper V2 (legacy) má také podporu, ale je méně spolehlivý než V3
- `US_CITIES` list v scraperV3.js obsahuje ~30 měst - pokud firma je z malého města, detekce z textu nemusí fungovat

---

## Soubory změněny

1. ✅ `server/services/scraperV3.js` - extrakce city v extractNAP()
2. ✅ `server/services/auditPipeline.js` - auto-detekce po scrapování (V3 + V2 paths)
3. ✅ `server/services/promptTemplates.js` - odstranění hardcoded Miami
4. ✅ `server/services/assistantPrompts.js` - odstranění hardcoded Miami
5. ✅ `server/routes/admin.js` - prázdné město pro nové audity

**Template (bez změn):**
- `server/views/audit-public-v2.ejs` - už používá `<%= vm.hero.city %>`

---

## Commit Message (návrh)

```
feat: dynamic city detection from scraped data

- Extract city from JSON-LD addressLocality in NAP data
- Auto-detect city in audit pipeline (v3 & v2 paths)
- Remove hardcoded "Miami" from prompts and defaults
- Fallback to "your area" if city not detected
- Logs city detection status during scraping

Fixes issue where all audits showed Miami regardless of actual business location.
```
