# 🚨 PRODUCTION FIX - IMMEDIATE STEPS

**Commit:** 94de56d + seed script  
**Issue:** Prompty jsou v DB, ne v kódu → localhost a produkce mají různé prompty

---

## ⚡ IMMEDIATE ACTION (5 minut)

### 1. Deploy Latest Code
Render → Dashboard → **Manual Deploy** → Deploy latest commit

Počkej až je status **"Live"**.

---

### 2. Run Seed Script na Renderu

#### Option A: Via Render Shell (doporučuji)
```bash
# 1. Otevři Render Dashboard → tvoje služba → Shell tab
# 2. Spusť:
cd /opt/render/project/src
node server/scripts/seed-assistants.js
```

#### Option B: Via SSH (pokud máš SSH access)
```bash
ssh render
cd /opt/render/project/src
node server/scripts/seed-assistants.js
```

---

### 3. Verify

Po spuštění seed scriptu by měl vypsat:
```
[SEED ASSISTANTS] ✅ All assistants seeded successfully
Found 6 active assistants in DB
  - evidence_normalizer (openai/gpt-4.1, temp=0.1, prompt=2500 chars)
  - ux_conversion_auditor (google/gemini-2.5-pro, temp=0.2, prompt=4000 chars)
  - local_seo_geo_auditor (openai/gpt-4.1, temp=0.15, prompt=3500 chars)
  - offer_strategist (anthropic/claude-3.7-sonnet, temp=0.35, prompt=3000 chars)
  - outreach_email_writer (openai/gpt-4.1, temp=0.45, prompt=2800 chars)
  - public_audit_page_composer (google/gemini-2.5-pro, temp=0.25, prompt=4200 chars)
```

---

### 4. Test Audit

1. Admin → Audits → nový audit
2. Process
3. **Mělo by projít BEZ auto-repair failures**

---

## ✅ EXPECTED RESULTS

| Before | After |
|--------|-------|
| ❌ Auto-repair runs 1-2x per audit | ✅ Auto-repair runs 0x |
| ❌ Bad `job.city` references | ✅ Clean `llm_context.city` refs |
| ⚠️ 5-10s latence navíc | ✅ No extra latence |
| ⚠️ Validation warnings | ✅ Clean outputs |

---

## 🔍 Troubleshooting

### "Table ai_assistants doesn't exist"
```bash
# DB needs init - restart server first
curl https://maxandjacob.com/health
# Then run seed script again
```

### "No prompts found"
```bash
# Check if assistantPrompts.js exists
ls -la server/services/assistantPrompts.js
```

### Still getting auto-repair?
```bash
# Check which assistants were updated
sqlite3 /opt/render/project/data/data.db "SELECT key, LENGTH(prompt) FROM ai_assistants;"
```

---

## 📊 VERIFICATION CHECKLIST

- [ ] Seed script ran without errors
- [ ] 6 assistants exist in DB
- [ ] No `job.city` references in prompts
- [ ] Test audit completed successfully
- [ ] Auto-repair count = 0

---

## 💬 JAK TO FUNGUJE

```
PŘED:
Localhost: Má prompty v lokální DB (správné)
Produkce: Má prázdnou/starou DB (špatné)
→ Různé outputy, různé chyby

PO:
Obě prostředí: Mají stejné prompty z kódu
→ Identické chování 1:1
```

---

## 🆘 KDYŽ TO NEFUNGUJE

Pošli mi output z:
```bash
node server/scripts/seed-assistants.js
```

A já to doladím.
