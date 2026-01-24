# 🚨 EMERGENCY FIX - AUDIT NEFUNGUJE

**Symptom:** Audit se negeneruje, "kompletně rozházeno"  
**Root Cause:** DB assistants nejsou inicializováni  
**Fix Time:** 2 minuty

---

## ⚡ IMMEDIATE STEPS

### 1. Force Redeploy
```
Render Dashboard → Manual Deploy → Clear build cache → Deploy latest commit
```

**NEBO restart appky:**
```
Render Dashboard → Settings → Restart Web Service
```

### 2. Check Logs
Po restartu by měl vypsat:
```
Default assistant Evidence Normalizer created
Default assistant UX Conversion Auditor created
Default assistant Local SEO & GEO Auditor created
Default assistant Offer Strategist created
Default assistant Outreach Email Writer created
Default assistant Public Audit Page Composer created
```

**Nebo:**
```
AI assistants already exist (6 found)
```

### 3. Verify
Zkus audit - měl by projít celý.

---

## 🔍 WHAT WENT WRONG

Systém má auto-seeding assistants v `db.js:375`, ale:
- ✅ Kód je správný (commit 334c078)
- ⚠️ Render možná cachoval starou verzi
- ⚠️ Nebo DB init failoval

---

## 🆘 IF STILL BROKEN

Spusť seed script ručně:
```bash
# Render Shell
cd /opt/render/project/src  
node server/scripts/seed-assistants.js
```

Mělo by vypsat:
```
[SEED ASSISTANTS] ✅ All assistants seeded successfully
Found 6 active assistants in DB
```

Pak restart serveru.

---

## ✅ VERIFICATION

```bash
# Check assistants count
curl https://maxandjacob.com/health

# Should show:
# status: "ok"
# database: "connected"
```

Zkus audit - měl by projít!
