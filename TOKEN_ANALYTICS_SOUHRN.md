# Token Analytics - Souhrn Implementace

## ✅ Co jsem udělal

### 1. Vytvořil jsem **neinvazivní analytický modul** (`tokenAnalytics.js`)

**Funkce:**
- ✅ Sleduje velikosti payloadů před odesláním do LLM
- ✅ Loguje skutečné token usage z API response
- ✅ Detekuje duplicitní/redundantní data
- ✅ Počítá náklady per assistant a per job
- ✅ Generuje detailní reporty do JSON souborů
- ✅ Vypisuje warnings do konzole během běhu

**Důležité:** Neukládá sensitive data, jen velikosti a čísla!

---

### 2. Integroval jsem tracking do existujícího pipeline

**Změny v `auditPipeline.js`:**
- ➕ Import analytického modulu (1 řádek)
- ➕ Volání `trackPayload()` před LLM call (1 řádek)
- ➕ Volání `trackResponse()` po LLM response (1 řádek)
- ➕ Volání `generateJobReport()` na konci pipeline (1 řádek)

**Celkem: 4 řádky kódu přidány, nic změněno!**

---

### 3. Vytvořil jsem CLI nástroje

**`scripts/analyze-token-usage.js`** - Souhrnné reporty
```bash
# Základní přehled (posledních 100 jobů)
node scripts/analyze-token-usage.js

# Jen nedávné joby (24h)
node scripts/analyze-token-usage.js --recent

# Detail pro konkrétního asistenta
node scripts/analyze-token-usage.js --assistant evidence_normalizer
```

**`scripts/inspect-payload-size.js`** - Diagnostika konkrétního jobu
```bash
# Ukáže payload sizes pro job ID 123 (bez spuštění LLM)
node scripts/inspect-payload-size.js 123
```

---

### 4. Přidal jsem dokumentaci

- **`TOKEN_ANALYTICS_README.md`** - Kompletní návod
- **`TOKEN_USAGE_FINDINGS.md`** - Detekované problémy + doporučení
- **`TOKEN_ANALYTICS_SOUHRN.md`** - Tento dokument

---

## 🔍 Co jsem našel (bez spuštění, jen analýzou kódu)

### Potenciální optimalizace:

1. **`raw_dump` se posílá do 3 asistentů** (A1, A2, A3)
   - A2 možná nepotřebuje (má `llm_context` z A1)
   - A3 potřebuje jen část (`jsonld_raw`)
   - **Možná úspora: ~35,000 tokenů per job**

2. **A6 dostává kompletní audit výstupy**
   - Potřebuje jen `top_issues`, ne celý objekt
   - **Možná úspora: ~5,000 tokenů per job**

3. **`text_snippet` je 1200 znaků per page**
   - Možná stačí 600-800 znaků
   - **Možná úspora: ~1,500 tokenů per job**

4. **Hodně headings v arrays**
   - h2: 10, h3: 15, h6: 15 per page
   - **Možná úspora: ~800 tokenů per job**

**Celkem možná úspora: ~42,000 tokenů per job (~$0.127)**

---

## 🚀 Jak to použít?

### Krok 1: Spusť pár auditů normálně

Analytics je **automaticky zapnutá**. Při běhu pipeline uvidíš v konzoli:

```
[TokenAnalytics] evidence_normalizer - Payload: 142.5 KB, Est. ~18,450 tokens
[TokenAnalytics] ⚠️  Large payload: ~18,450 estimated input tokens
[TokenAnalytics] 🔍 Potential optimizations:
   - raw_dump data is being sent (check if needed) (85.2 KB)
...
[TokenAnalytics] evidence_normalizer - Actual tokens: 19,234 (input: 18,892, output: 342), Cost: $0.0623
...
================================================================================
[TokenAnalytics] JOB REPORT - Job ID: 123
================================================================================
Total Assistants: 6
Total Estimated Input Tokens: 45,230
Total Actual Tokens: 52,180
Total Cost: $0.1956
...
```

### Krok 2: Zkontroluj logy

```bash
# Najdi nejnovější reporty
ls -lt logs/token-analytics/

# Otevři jeden report
cat logs/token-analytics/job-123-*.json | jq
```

### Krok 3: Vygeneruj souhrnný report

```bash
# Po 20-30 auditech spusť
node scripts/analyze-token-usage.js

# Uvidíš průměry, trendy, nejčastější duplicity
```

### Krok 4: Diagnostika konkrétního jobu

```bash
# Pokud jeden job vypadá divně
node scripts/inspect-payload-size.js 123

# Ukáže ti přesně, co se posílá do každého asistenta
```

---

## ⚙️ Konfigurace

### Vypnout analytics (pro production?)

V `.env`:
```
TOKEN_ANALYTICS_ENABLED=false
```

### Změnit ceny (pokud používáš jiný model)

V `server/services/tokenAnalytics.js`:
```javascript
const COST_PER_1M_INPUT_TOKENS = 3.0;   // USD
const COST_PER_1M_OUTPUT_TOKENS = 15.0; // USD
```

---

## 📊 Co analytics detekuje?

### Automaticky:

✅ **Duplicitní data:**
- `raw_dump` v multiple payloads
- Stejná data poslaná vícekrát

✅ **Velké payloady:**
- Payload > 50KB dostane warning
- Evidence pack > 50KB
- LLM context > 30KB

✅ **Multiple audit outputs:**
- Když payload obsahuje >2 audit výstupy najednou

✅ **Porovnání odhad vs. skutečnost:**
- Ověřuje, jestli jsou odhady tokenů přesné

### V reportech:

- Největší payload (který assistant, kolik KB)
- Nejdražší assistant (který, kolik $)
- Všechny detekované duplicity
- Všechny warnings
- Trendy v čase (aggregate report)

---

## 🎯 Další kroky

### Nyní:
1. ✅ Spusť 10-20 auditů s různými niches/cities
2. ✅ Sleduj console output - vidíš nějaké problémy?
3. ✅ Zkontroluj logy v `logs/token-analytics/`
4. ✅ Spusť `node scripts/analyze-token-usage.js`

### Pokud analytics potvrdí problémy:
5. ⚠️  Zkontroluj assistant prompty - potřebují opravdu všechna data?
6. ⚠️  Implementuj optimalizace postupně (high priority first)
7. ⚠️  Měř před/po každé změně
8. ⚠️  Ověř, že kvalita outputu neklesla

### Dlouhodobě:
9. 🔄 Pravidelně spouštěj aggregate report (1× týdně?)
10. 🔄 Sleduj trendy - roste spotřeba?
11. 🔄 Když přidáváš nové featury, zkontroluj dopad na tokeny

---

## ⚠️ Důležité!

### NEOPRAVUJ NIC SLEPĚ

Analytics **jen detekuje** potenciální problémy. Před každou optimalizací:

1. **Ověř v promptu** - potřebuje LLM tato data?
2. **Otestuj na 5-10 jobech** - neklesne kvalita?
3. **Měř před/po** - byla úspora skutečná?

### Prioritizuj KVALITU před úsporami

Pokud `raw_dump` v A2 zlepšuje výsledky → **nech tam**.  
Pokud trimmed audits v A6 sníží kvalitu → **nech celé**.  

Cíl je najít **WIN-WIN**: stejná kvalita, nižší náklady.

---

## 📁 Vytvořené soubory

```
server/services/
  └── tokenAnalytics.js           # Hlavní modul (570 řádků)

scripts/
  ├── analyze-token-usage.js      # CLI: aggregate reports
  └── inspect-payload-size.js     # CLI: payload diagnostics

logs/
  └── token-analytics/            # JSON reporty (gitignored)

docs:
  ├── TOKEN_ANALYTICS_README.md   # Kompletní návod
  ├── TOKEN_USAGE_FINDINGS.md     # Detekované problémy
  └── TOKEN_ANALYTICS_SOUHRN.md   # Tento souhrn
```

---

## 🧪 Testování

Všechny soubory prošly syntax check:
```bash
✅ tokenAnalytics.js - OK
✅ auditPipeline.js - OK
✅ analyze-token-usage.js - OK
✅ inspect-payload-size.js - OK
```

Žádné linter errors!

---

## 💡 Tip: První test

Zkus spustit inspector na existujícím jobu:

```bash
# Najdi job ID
sqlite3 data.db "SELECT id, input_url FROM audit_jobs WHERE status='completed' ORDER BY id DESC LIMIT 5"

# Inspektuj payload sizes
node scripts/inspect-payload-size.js <job_id>
```

Uvidíš, kolik KB a tokenů se posílá do každého asistenta **BEZ spuštění LLM**.

---

Hotovo! Máš kompletní diagnostický systém bez změny funkcionality. Teď je čas sbírat data a hledat optimalizace! 🚀
