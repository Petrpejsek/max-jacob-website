# PRODUCTION vs LOCALHOST DIAGNOSTIC
**Date:** 2026-01-24  
**Status:** ⚠️ CRITICAL ISSUES FOUND

---

## 🔴 CRITICAL ISSUE #1: PROMPTS SOURCE

### Problem
**Prompty se NEPOUŽÍVAJÍ z kódu (`server/services/assistantPrompts.js`)!**

Systém používá **DB tabulku `ai_assistants`** pro prompty, ne kód!

### Evidence
```javascript
// server/services/auditPipeline.js:2391
getAllAssistants((err, data) => {
  // Načítá prompty z DB tabulky ai_assistants
  const prompt = assistant.prompt; // <-- Z DB!
});
```

### Impact
- Localhost má prompty v DB (`ai_assistants` table)
- Produkce má prázdnou/jinou DB
- **Fix v `assistantPrompts.js` NEMÁ ŽÁDNÝ EFEKT**

---

## 🔴 CRITICAL ISSUE #2: BAD PROMPT REFERENCES

### Problem
Některé prompty v DB obsahují **nevalidní reference** `job.city` místo `llm_context.city`.

### Evidence
```bash
sqlite3> SELECT key FROM ai_assistants WHERE prompt LIKE '%job.city%';
local_seo_geo_auditor   <-- ⚠️ BAD
outreach_email_writer   <-- ⚠️ BAD
```

### Impact
LLM vidí `job.city` v příkladu → používá to doslova → validation failuje → auto-repair → extra latence.

---

## 🟡 ISSUE #3: DB CORRUPTION ON LOCALHOST

### Problem
Lokální databáze `data.db` je částečně corrupted:
```
Error: stepping, database disk image is malformed (11)
```

### Impact
- Nemůžu přesně zkontrolovat všechny lokální prompty
- Ale systém stále funguje (SQLite je resilient)

---

## ✅ WHAT WORKS CORRECTLY

### Scraper V3
- ✅ User-Agent fix applied (commit 571b12a)
- ✅ City detection fallback (commit 045a9ba)
- ✅ `page.evaluate()` error handling (commit a8b3a40)
- ✅ Playwright path fix (commit 386542d)

### Code Files (All Synced to Production)
- ✅ `server/services/assistantPrompts.js` (commit 4e92ecd) - ale NEPOUŽÍVÁ SE!
- ✅ `server/services/payloadBuilders.js`
- ✅ `server/services/auditPipeline.js`
- ✅ `server/services/outputValidator.js`
- ✅ `server/services/scraperV3.js`

---

## 🔧 ROOT CAUSE SUMMARY

| Component | Localhost | Production | Match? |
|-----------|-----------|------------|--------|
| Code files | Latest | Latest (commit 4e92ecd) | ✅ YES |
| DB `ai_assistants` | Has 6 assistants with prompts | ⚠️ **UNKNOWN** (not checked) | ❌ NO |
| Prompts source | DB table | DB table | ✅ YES |
| Bad `job.city` refs | In 2 assistants | ⚠️ **LIKELY SAME** | ❌ NO |
| Preset `plumbing` | Has `default_city = NULL` | Auto-seeded on empty DB | ✅ YES |

---

## 🎯 ACTION PLAN TO FIX

### 1. Sync DB Assistants from Code to Production ⚡ CRITICAL

**Problem:** Production DB `ai_assistants` table is empty or outdated.

**Solution:** Create migration script to populate `ai_assistants` from `assistantPrompts.js`:

```javascript
// server/scripts/seed-assistants.js
const { getAssistantPrompt, getAllAssistantPrompts } = require('../services/assistantPrompts');
const db = require('../db');

const ASSISTANTS_CONFIG = [
  { key: 'evidence_normalizer', name: 'Evidence Normalizer', model: 'openai/gpt-4.1', temperature: 0.1, sort_order: 1 },
  { key: 'ux_conversion_auditor', name: 'UX Conversion Auditor', model: 'google/gemini-2.5-pro', temperature: 0.2, sort_order: 2 },
  { key: 'local_seo_geo_auditor', name: 'Local SEO & GEO Auditor', model: 'openai/gpt-4.1', temperature: 0.15, sort_order: 3 },
  { key: 'offer_strategist', name: 'Offer Strategist', model: 'anthropic/claude-3.7-sonnet', temperature: 0.35, sort_order: 4 },
  { key: 'outreach_email_writer', name: 'Outreach Email Writer', model: 'openai/gpt-4.1', temperature: 0.45, sort_order: 5 },
  { key: 'public_audit_page_composer', name: 'Public Audit Page Composer', model: 'google/gemini-2.5-pro', temperature: 0.25, sort_order: 6 }
];

// Upsert each assistant with prompt from assistantPrompts.js
```

**Run on production:**
```bash
node server/scripts/seed-assistants.js
```

### 2. Fix Bad References ⚡ CRITICAL

Already fixed in code (commit 4e92ecd), but needs to be applied to DB.

After running seed script, all prompts will be clean.

---

## 📊 PRODUCTION CHECKLIST

- [x] Code synced to production (commit 4e92ecd)
- [ ] **Run `seed-assistants.js` on production** ⚡ CRITICAL
- [ ] Verify `ai_assistants` table has 6 rows
- [ ] Test audit on production
- [ ] Check auto-repair frequency (should drop to 0)

---

## 🔍 VERIFICATION COMMANDS

### On Production (Render Shell or SSH):
```bash
# Check if ai_assistants table exists
sqlite3 /path/to/data.db "SELECT COUNT(*) FROM ai_assistants;"

# Check prompt lengths (should all be >1000 chars)
sqlite3 /path/to/data.db "SELECT key, LENGTH(prompt) FROM ai_assistants;"

# Verify no bad references
sqlite3 /path/to/data.db "SELECT key FROM ai_assistants WHERE prompt LIKE '%job.city%';"
```

### Expected Output:
```
COUNT(*): 6
LENGTH(prompt): ~2500-4500 per assistant
Bad refs: (empty result)
```

---

## 💡 LONG-TERM FIX

**Move prompts back to code** and remove DB dependency:

1. Use `assistantPrompts.js` as source of truth
2. Keep `ai_assistants` table for model/temperature config only
3. Update `auditPipeline.js` to merge:
   - Prompt from `assistantPrompts.js`
   - Config (model, temp) from DB

This prevents drift between localhost and production.

---

## 📝 NOTES

- Local DB corruption is a red flag → backup and rebuild recommended
- Auto-repair works but adds latency (5-10s per assistant)
- Evidence validation is correct and catching LLM mistakes
