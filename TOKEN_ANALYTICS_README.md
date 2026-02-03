# Token Analytics - Non-Invasive LLM Monitoring

Tento modul poskytuje **neinvazivní sledování spotřeby tokenů** pro všech 6 LLM asistentů v audit pipeline.

## Co se sleduje

### 1. **Velikosti payloadů**
- Počet bytů odeslaných do LLM
- Odhad počtu input tokenů (před odesláním)
- Rozklad po jednotlivých polích payloadu

### 2. **Skutečná spotřeba tokenů**
- Input tokens (prompt)
- Output tokens (completion)
- Total tokens
- Porovnání odhad vs. skutečnost

### 3. **Náklady**
- Cena za input tokeny
- Cena za output tokeny
- Celková cena per assistant
- Celková cena per job

### 4. **Detekce duplicit a optimalizací**
- Duplicitní data v payloadech
- Příliš velké payloady
- Nedůsledné ořezání dat
- Návrhy na optimalizace

## Použití

### Automatické logování

Analytika je **automaticky zapnutá** při každém spuštění pipeline. Po dokončení jobu se vypíše report:

```
================================================================================
[TokenAnalytics] JOB REPORT - Job ID: 123
================================================================================
Total Assistants: 6
Total Estimated Input Tokens: 45,230
Total Actual Tokens: 52,180
Total Cost: $0.1956

Largest Payload: evidence_normalizer
  Size: 142.5 KB
  Est. Tokens: 18,450

Most Expensive Assistant: public_audit_page_composer
  Cost: $0.0624
  Tokens: 15,230

⚠️  OPTIMIZATION OPPORTUNITIES (3):
  1. [evidence_normalizer] raw_dump data is being sent (check if needed)
     Size: 85.2 KB
  2. [ux_conversion_auditor] raw_dump data is being sent (check if needed)
     Size: 85.2 KB
  3. [public_audit_page_composer] Multiple audit outputs in payload: ux_audit_json, local_seo_audit_json, offer_copy_json
     Size: 24.8 KB
================================================================================
```

### Souhrnné reporty

Pro analýzu napříč více joby použij CLI tool:

```bash
# Základní report (posledních 100 jobů)
node scripts/analyze-token-usage.js

# Pouze nedávné joby (24h)
node scripts/analyze-token-usage.js --recent

# Omezit počet analyzovaných jobů
node scripts/analyze-token-usage.js --limit 50

# Detail pro konkrétního asistenta
node scripts/analyze-token-usage.js --assistant evidence_normalizer

# Nápověda
node scripts/analyze-token-usage.js --help
```

### Příklad souhrnného reportu

```
================================================================================
[TokenAnalytics] AGGREGATE REPORT
================================================================================
Total Jobs Analyzed: 47
Date Range: 2026-01-15T10:23:00.000Z to 2026-01-31T18:45:00.000Z

Total Tokens Consumed: 2,450,680
Total Cost: $9.18
Average per Job: 52,140 tokens, $0.1953

Per-Assistant Statistics:
  evidence_normalizer:
    Runs: 47
    Total: 867,200 tokens, $3.24
    Avg: 18,450 tokens, $0.0689

  public_audit_page_composer:
    Runs: 45
    Total: 685,350 tokens, $2.94
    Avg: 15,230 tokens, $0.0653

  ux_conversion_auditor:
    Runs: 46
    Total: 412,500 tokens, $1.45
    Avg: 8,967 tokens, $0.0315

  ...

Common Duplicate Patterns:
  raw_dump_in_evidence_normalizer: 47 occurrences
  raw_dump_in_ux_conversion_auditor: 46 occurrences
  multiple_audits_in_public_audit_page_composer: 45 occurrences
================================================================================
```

## Vypnutí analytiky

Pokud chceš analytiku vypnout (např. v produkci), nastavení env proměnné:

```bash
export TOKEN_ANALYTICS_ENABLED=false
```

Nebo v `.env`:

```
TOKEN_ANALYTICS_ENABLED=false
```

## Logy

Všechny reporty se ukládají do:

```
logs/token-analytics/job-{jobId}-{timestamp}.json
```

Tyto soubory obsahují kompletní detail pro každý job včetně:
- Všech payloadů (velikosti, odhady)
- Všech tokenů (skutečné hodnoty)
- Všech nákladů
- Všech detekovaných problémů

## Co dělat s výsledky?

### 1. **Identifikuj největší spotřebitele**
   - Zkontroluj, který assistant spotřebovává nejvíc tokenů
   - Ověř, jestli je to oprávněné nebo jde o optimalizaci

### 2. **Hledej duplicity**
   - Analytika ti řekne, kde se duplikují data
   - Například: `raw_dump` se posílá do A1, A2, A3 - je to nutné?
   - Například: `ux_audit_json + local_seo_audit_json` se posílají do A4 a A6 - musí tam být celé?

### 3. **Optimalizuj payloady**
   - Pokud je payload > 100KB, zkontroluj, jestli se dá něco vynechat
   - Zkrať text snippety (`text_snippet: 1200 znaků` → možná stačí 800?)
   - Omezte arrays (`h2: slice(0, 10)` → možná stačí `slice(0, 5)`?)

### 4. **Sleduj trendy v čase**
   - Pravidelně spouštěj aggregate report
   - Porovnej s předchozími měsíci
   - Ověř, jestli nové featury nezvedají spotřebu

## Příklady optimalizací

### Detekováno: `raw_dump` se posílá do 3 asistentů
**Řešení:**
- A1 (Evidence Normalizer) potřebuje full `raw_dump` → OK
- A2 (UX Auditor) potřebuje jen `llm_context` (output A1) → **možná nepotřebuje raw_dump**
- A3 (SEO Auditor) potřebuje `jsonld_raw` z raw_dump → **stačí jen část**

**Ušetření:** ~85KB × 2 asistenti = **~170KB per job** = ~42,500 tokenů

### Detekováno: `text_snippet` je 1200 znaků pro každou page
**Řešení:**
- Zkrať na 600-800 znaků
- Nebo pošli jen pro prvních 3-5 pages (ne pro všech 8)

**Ušetření:** ~30% tokenů v `raw_dump`

### Detekováno: A6 dostává všechny audit výstupy
**Řešení:**
- A6 (Public Page Composer) potřebuje jen `top_issues` z auditu, ne celý objekt
- Vytvoř `trimmedUxAudit` s jen relevantními fieldy

**Ušetření:** ~20KB per job

## Konfigurační konstanty

V `tokenAnalytics.js` můžeš upravit:

```javascript
const COST_PER_1M_INPUT_TOKENS = 3.0;   // USD - nastav podle tvého modelu
const COST_PER_1M_OUTPUT_TOKENS = 15.0; // USD - nastav podle tvého modelu
const CHARS_PER_TOKEN = 4;               // Průměr pro Claude/GPT
```

## Technické detaily

### Jak to funguje?

1. **Před voláním LLM:** `trackPayload()` analyzuje velikost payloadu a odhadne tokeny
2. **Po odpovědi LLM:** `trackResponse()` zaloguje skutečné tokeny z API response
3. **Na konci pipeline:** `generateJobReport()` vytvoří souhrnný report

### Je to bezpečné?

✅ **Ano, je to 100% neinvazivní:**
- Jen loguje data, nemění chování
- Neukládá sensitive data (jen velikosti a čísla)
- Lze vypnout bez změny kódu
- Nemá žádný dopad na výkon (logování je async)

### Co se neloguje?

- **Nelogují se skutečné payloady** (jen velikosti)
- **Nelogují se LLM odpovědi** (jen token counts)
- **Nelogují se API keys** nebo credentials

## Další kroky

1. **Spusť pár auditů** a sleduj konzoli
2. **Zkontroluj logy** v `logs/token-analytics/`
3. **Vygeneruj aggregate report** přes CLI tool
4. **Identifikuj optimalizace** podle detekovaných duplicit
5. **Implementuj optimalizace** v `payloadBuilders.js`

---

**Poznámka:** Tento modul byl vytvořen jako **diagnostický nástroj**. Slouží k identifikaci neefektivit, ne k jejich automatické opravě. Vždy prověř, jestli je detekovaná "duplicita" opravdu problém nebo nutný requirement pro LLM.
