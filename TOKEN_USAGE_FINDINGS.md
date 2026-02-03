# Token Usage - Prvotní Nálezy & Doporučení

## 🔍 Co jsem zkontroloval

Analyzoval jsem celou LLM pipeline a identifikoval jsem:

1. **Strukturu volání:** 6 asistentů v sekvenci/paralelně
2. **Velikosti payloadů:** Co se posílá do každého asistenta
3. **Potenciální duplicity:** Kde se data opakují zbytečně
4. **Optimalizační příležitosti:** Co by šlo zmenšit

---

## 📊 Struktura Pipeline

```
STAGE 1:
  A1: Evidence Normalizer
    Input: evidence_pack_v2 + raw_dump (8 pages) + screenshots
    Output: llm_context_json

STAGE 2 (paralelně):
  A2: UX Auditor
    Input: llm_context + raw_dump + screenshots
    
  A3: SEO Auditor
    Input: llm_context + raw_dump

STAGE 3:
  A4: Offer Strategist
    Input: llm_context + ux_audit + seo_audit

STAGE 4 (paralelně):
  A5: Email Writer
    Input: llm_context + offer_copy + links
    
  A6: Public Page Composer
    Input: llm_context + ux_audit + seo_audit + offer_copy + screenshots + compliance + links
```

---

## 🚨 Detekované Potenciální Problémy

### 1. **raw_dump se posílá do 3 asistentů**

**Co se děje:**
- A1 dostává `raw_dump` (8 pages, trimmed) - **NUTNÉ**
- A2 dostává `raw_dump` (8 pages, trimmed) - **MOŽNÁ ZBYTEČNÉ?**
- A3 dostává `raw_dump` (8 pages, trimmed) - **ČÁSTEČNĚ ZBYTEČNÉ?**

**Velikost:**
- `raw_dump` per page: ~10-15 KB
- 8 pages × 3 assistants = **~240-360 KB posláno 3×**

**Doporučení:**
- ✅ **A1 potřebuje full raw_dump** - nechej tak
- ❓ **A2 (UX Auditor)**: Zkontroluj prompt - možná stačí jen `llm_context` (to je output A1, který už je normalized). Pokud nepotřebuje raw data, odstraň `raw_dump` z A2 payloadu.
- ⚠️  **A3 (SEO Auditor)**: Potřebuje `jsonld_raw` a možná city mentions z pages. Místo celého `raw_dump` by mohl dostat jen:
  ```javascript
  raw_dump_minimal: {
    jsonld_raw: raw_dump.jsonld_raw,
    jsonld_extracted: raw_dump.jsonld_extracted,
    page_titles: pages.map(p => p.title) // Pro city detection
  }
  ```

**Potenciální úspora:** **~150-240 KB** (2× raw_dump)

---

### 2. **A6 dostává VŠECHNO**

**Co se děje:**
A6 (Public Page Composer) dostává:
- `llm_context` (output A1)
- `ux_audit_json` (output A2) - **celý objekt**
- `local_seo_audit_json` (output A3) - **celý objekt**
- `offer_copy_json` (output A4)
- `screenshots`
- `compliance` rules
- `links`

**Velikost:**
- `ux_audit_json`: ~15-25 KB
- `local_seo_audit_json`: ~10-20 KB
- Celkem A6 payload: **~80-120 KB**

**Problém:**
A6 vytváří public page, takže potřebuje jen:
- Z `ux_audit_json`: `top_issues` (max 3-5 items)
- Z `local_seo_audit_json`: možná `nap_audit.status` a základní scores
- Ale dostává **celé objekty** včetně všech scores, všech mobile_issues, všech detailů

**Doporučení:**
Vytvoř `trimmed` verze auditů pro A6:

```javascript
// V buildA6Payload():
const trimmedUxAudit = {
  top_issues: ux_audit_json.top_issues?.slice(0, 3) || [],
  scores: ux_audit_json.scores || {}
};

const trimmedSeoAudit = {
  nap_audit: local_seo_audit_json.nap_audit || {},
  scores: local_seo_audit_json.scores || {}
};
```

**Potenciální úspora:** **~15-30 KB**

---

### 3. **evidence_pack_v2 může být velký**

**Co se děje:**
`evidence_pack_v2` jde do A1 (Evidence Normalizer) a může obsahovat:
- Velké arrays (`services`, `trust_signals`, atd.)
- Redundantní data
- Dlouhé text snippety

**Velikost:**
- Typicky: 30-80 KB
- V extrémních případech: >100 KB

**Doporučení:**
Zkontroluj `evidence_pack_v2` strukturu a:
- Omez `text_snippet` na každém service/trust signal na max 200-300 znaků
- Omez arrays (např. max 20 services, max 15 trust signals)
- Odstraň redundantní metadata

**Potenciální úspora:** **~10-20 KB**

---

### 4. **text_snippet v raw_dump pages**

**Co se děje:**
Každá page v `raw_dump` má `text_snippet` oříznutý na **1200 znaků**.

**Velikost:**
- 1200 znaků × 8 pages = **9,600 znaků** = ~2,400 tokenů

**Doporučení:**
- Zkrať na **600-800 znaků** per page (stále dost pro kontext)
- Nebo pošli full snippet jen pro **homepage + top 3 pages**

**Potenciální úspora:** **~1,000-1,500 tokenů** (input)

---

### 5. **Headings arrays v raw_dump**

**Co se děje:**
```javascript
headings: {
  h1: headings.h1 || null,
  h2: Array.isArray(headings.h2) ? headings.h2.slice(0, 10) : [],
  h3: Array.isArray(headings.h3) ? headings.h3.slice(0, 15) : [],
  h6: Array.isArray(headings.h6) ? headings.h6.slice(0, 15) : []
}
```

**Problém:**
- 10 h2 + 15 h3 + 15 h6 = **40 headings per page**
- 8 pages × 40 headings = **320 headings**

**Doporučení:**
- Zkrať na: `h2: slice(0, 5)`, `h3: slice(0, 8)`, `h6: slice(0, 5)`
- H6 jsou často navigační/footer links - možná úplně vynechat

**Potenciální úspora:** **~500-800 tokenů**

---

## 💰 Odhadované Celkové Úspory

Pokud implementuješ všechny optimalizace:

| Optimalizace | Úspora tokenů | Úspora $ per job |
|-------------|---------------|------------------|
| Odstranění raw_dump z A2 | ~20,000 | $0.06 |
| Zmenšení raw_dump pro A3 | ~15,000 | $0.045 |
| Trimmed audits pro A6 | ~5,000 | $0.015 |
| Kratší text_snippet | ~1,500 | $0.0045 |
| Méně headings | ~800 | $0.0024 |
| **CELKEM** | **~42,300** | **~$0.127** |

**Při 100 jobů/měsíc:**
- Úspora: **~4.2M tokenů**
- Úspora: **~$12.70/měsíc**

**Při 1000 jobů/měsíc:**
- Úspora: **~42M tokenů**
- Úspora: **~$127/měsíc**

---

## ✅ Co Je Správně (Nech Tak)

1. **`trimRawDumpForAssistants()` už existuje** - dobře!
   - Omezuje na 8 pages (ne všechny)
   - Omezuje headings arrays
   - Omezuje text_snippet na 1200 chars

2. **`normalizeScreenshotsForAssistants()` jen posílá refs** - dobře!
   - Neposílá base64 images, jen URLs/cesty

3. **Payload builders jsou separátní** - dobře!
   - Každý assistant má vlastní payload builder
   - Snadná customizace per assistant

4. **Token usage se už trackuje v DB** - dobře!
   - `assistant_runs.token_usage_json`
   - Data už jsou k dispozici

---

## 🛠️ Implementační Plán

### Fáze 1: Monitoring (HOTOVO ✅)
- [x] Token analytics modul vytvořen
- [x] Automatické logování zapnuto
- [x] CLI nástroje pro analýzu
- [x] Diagnostické scripty

### Fáze 2: Analýza (NYNÍ)
1. Spusť 5-10 reálných auditů
2. Zkontroluj logy v `logs/token-analytics/`
3. Spusť: `node scripts/analyze-token-usage.js`
4. Ověř, které optimalizace jsou prioritní

### Fáze 3: Optimalizace (PO ANALÝZE)
**Pouze pokud analytics potvrdí problémy:**

1. **High Priority:**
   - Odstranění `raw_dump` z A2 (pokud prompt nepotřebuje)
   - Zmenšení `raw_dump` pro A3 (jen jsonld + titles)

2. **Medium Priority:**
   - Trimmed audits pro A6
   - Kratší text_snippet (800 chars)

3. **Low Priority:**
   - Méně headings v raw_dump
   - Optimalizace evidence_pack_v2

### Fáze 4: Měření (PO OPTIMALIZACI)
1. Spusť dalších 5-10 auditů
2. Porovnej s Fází 2
3. Ověř úspory

---

## 📝 Jak Analyzovat

### 1. Zkontroluj existující job
```bash
# Najdi job ID v databázi
sqlite3 data.db "SELECT id, input_url, status FROM audit_jobs ORDER BY id DESC LIMIT 10"

# Inspektuj payload sizes
node scripts/inspect-payload-size.js 123
```

### 2. Spusť nový audit s analyticsou
```bash
# Analytics je automaticky zapnutá
# Sleduj console output během audit pipeline
```

### 3. Zkontroluj reports
```bash
# Souhrnný report
node scripts/analyze-token-usage.js

# Detail pro konkrétního asistenta
node scripts/analyze-token-usage.js --assistant evidence_normalizer
```

### 4. Zkontroluj logy
```bash
# Najdi nejnovější report
ls -lt logs/token-analytics/ | head -5

# Otevři v JSON vieweru
cat logs/token-analytics/job-123-*.json | jq
```

---

## ⚠️ Důležité Poznámky

### Před optimalizací VŽDY ověř:
1. **Potřebuje LLM tato data?** - Zkontroluj prompt každého asistenta
2. **Zhorší se kvalita outputu?** - Otestuj na 5-10 jobech
3. **Je to opravdu duplicita?** - Možná každý assistant potřebuje jiný view na data

### Neoptimalizuj slepě:
- Pokud `raw_dump` v A2 zlepšuje UX audit → nech tam
- Pokud trimmed audits v A6 sníží kvalitu public page → nech celé
- Prioritizuj **kvalitu před úsporami**

### Měř, nehadej:
- Spusť analytics minimálně na 20 jobech
- Sleduj trendy, ne jednotlivé výkyvy
- Porovnej před/po každé optimalizaci

---

## 🎯 Závěr

**Implementoval jsem:**
✅ Kompletní token analytics modul (neinvazivní)  
✅ Automatické logování při každém auditu  
✅ CLI nástroje pro analýzu  
✅ Diagnostické scripty  
✅ Dokumentaci

**Co dál:**
1. **Spusť pár auditů** a sleduj logy
2. **Zkontroluj detekované duplicity** - jsou reálné?
3. **Implementuj optimalizace** postupně (high priority first)
4. **Měř výsledky** před/po každé změně

**Neměnil jsem:**
❌ Žádný existující kód (kromě 3 řádků pro tracking)  
❌ Žádné payloady  
❌ Žádné prompty  
❌ Žádnou funkcionalitu

Všechno je připraveno na diagnostiku. Teď je čas spustit pár auditů a podívat se na reálná čísla! 🚀
