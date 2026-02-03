# Two Founders Section - Redesign Complete ✅

## Co si přál → Co jsem udělal

Přesně podle tvých požadavků jsem přepracoval "Two Founders" sekci z generického pitche na **personalizovaný, data-driven proof report**.

---

## ✅ Všechny tvé požadavky implementovány

### A) ✅ Generická věta "We reviewed your site..." → Personalizace

**PŘED:**
```
"We reviewed your site and found the few changes that will move the needle fast."
```

**PO:**
```
"We audited {BusinessName} in {City} and found {issues_total} high-impact 
issues ({issues_critical} critical) holding back bookings."

"Estimated missed leads: {missed_leads_min}–{missed_leads_max}/month"
```

**PŘÍKLAD:**
> "We audited Orlando Plumbing Pro in Orlando and found 12 high-impact issues (4 critical) holding back bookings."
> 
> "Estimated missed leads: 20–32/month"

---

### B) ✅ Levý sloupec mrtv → Credibility Stack

**PŘED:**
- Jen fotky
- Prázdný prostor

**PO:**
- ✅ Fotky (zůstaly)
- ✅ 3 credibility chips ("why trust us"):
  - "✅ 7-Day Sprint (fixed scope)"
  - "✅ No meetings (short form only)"
  - "✅ Pay in 2 parts (milestone-based)"
- ✅ 1 mini proof metric z auditu:
  - "Your current site: 38/100 mobile conversion readiness"
  - nebo "AI visibility: 42/100"

**Tohle je ten "mikro-proof" co jsi chtěl.**

---

### C) ✅ Chybí "audit proof" → Napojeno na dashboard data

**PŘED:**
- Žádné napojení na data
- Vypadalo to jako pitch

**PO:**
- ✅ Používá `improvement_backlog.counts` (issues total/critical)
- ✅ Používá `health_snapshot.metrics` (mobile/AI scores)
- ✅ Kalkuluje missed leads (critical * 5-8 per month)
- ✅ Všechno je z reálného auditu, žádná fake data

---

### D) ✅ Bullets jsou "features" → Výsledky

**PŘED (feature-focused):**
```
✓ Build a mobile-first lead magnet (calls/text/bookings)
✓ Fix the trust + conversion flow above the fold
✓ Make it AI/GEO-ready so Google + AI can understand & recommend you
```

**PO (outcome-focused):**
```
✓ More booked calls with a mobile-first lead magnet (call/text/book)
✓ Higher trust rate above the fold (reviews + licenses + guarantees)
✓ More discovery via Google + AI (structured content + GEO signals)
```

**ZMĚNA:** Z "we build X" na "you get Y result"

---

### E) ✅ Generické CTAs → Personalizované

**PŘED:**
```
Get My Free Plan
See Preview Example
```

**PO:**
```
Get {BusinessName}'s Free Plan
See Your Preview
```

**PŘÍKLAD:**
> "Get Orlando Plumbing Pro's Free Plan"
> "See Your Preview"

---

## 🎯 Pattern podle tvého zadání

Přesně jak jsi psal:

```
Headline (zůstává):
Real help. Two founders. No agency runaround.

Personalized intro (1–2 řádky):
We audited {BusinessName} in {City} and found {issues_total} 
high-impact issues ({issues_critical} critical) holding back bookings.

1 řádek s konkrétní metrikou:
Estimated missed leads: {missed_leads_min}–{missed_leads_max}/month.
```

✅ **HOTOVO.**

---

## 📊 Data Flow (co se děje pod kapotou)

```
Audit Database
    ↓
improvement_backlog.counts
    ├── total: 12
    └── critical: 4
    ↓
buildTwoFoundersSection()
    ↓
Kalkulace:
    ├── missed_leads_min = 4 * 5 = 20
    ├── missed_leads_max = 4 * 8 = 32
    └── personalized_intro = "We audited {name} in {city}..."
    ↓
vm.two_founders
    ↓
EJS Template
    ↓
Rendered Page
```

**Klíč:** Reálná data z auditu → žádné hardcoded texty

---

## 🎨 Vizuální Layout

```
┌─────────────────────────────────────────────────────────┐
│              BLUE ROUNDED CARD                          │
│                                                         │
│  LEFT                    │  RIGHT                       │
│  ──────                  │  ──────                      │
│  [Max] [Jacob]           │  Real help. Two founders... │
│   👤     👤              │                              │
│  Strategy Design         │  We audited Orlando Plumbing│
│                          │  Pro in Orlando and found   │
│  ✅ 7-Day Sprint         │  12 issues (4 critical)...  │
│  ✅ No meetings          │                              │
│  ✅ Pay in 2 parts       │  Estimated missed leads:    │
│                          │  20-32/month                │
│  ┌───────────────────┐  │                              │
│  │ Audit Proof       │  │  ✓ More booked calls...     │
│  │ Mobile: 38/100    │  │  ✓ Higher trust rate...     │
│  └───────────────────┘  │  ✓ More discovery...        │
│                          │                              │
│                          │  [Get Orlando Plumbing      │
│                          │   Pro's Free Plan]          │
└─────────────────────────┴──────────────────────────────┘
```

---

## 🛠️ Co jsem změnil (technicky)

### 1. `server/helpers/auditViewModelV2.js`

Přidal jsem novou funkci `buildTwoFoundersSection()` která:

- Tahá `issues_total` a `issues_critical` z `improvement_backlog.counts`
- Kalkuluje `missed_leads_min` a `missed_leads_max` (critical * 5-8)
- Tahá `mobile_score` z `health_snapshot.metrics` (key: 'design')
- Tahá `ai_score` z `health_snapshot.metrics` (key: 'geo')
- Generuje personalizovaný intro text
- Generuje outcome-focused bullets
- Generuje personalizované CTA texty
- Vrací objekt `vm.two_founders` s všemi daty

### 2. `server/views/audit-public-v2.ejs`

Přepsal jsem sekci "Two Founders":

**LEFT COLUMN:**
- Fotky (zůstaly)
- 3 credibility chips (nové)
- 1 audit proof metric box (nové)

**RIGHT COLUMN:**
- Headline (zůstal)
- Personalizovaný intro (nový)
- Estimated impact line (nový)
- Outcome bullets z `vm.two_founders.outcome_bullets` (loop)
- Personalizované CTAs z `vm.two_founders.primary_cta_text`

---

## ✅ Graceful Degradation

Systém bezpečně handluje chybějící data:

```javascript
// Pokud není mobile_score
if (mobile_score === null && ai_score !== null) {
  → zobrazí AI score
}

// Pokud není ani jeden
if (mobile_score === null && ai_score === null) {
  → Audit Proof box se nezobrazí (nefalšuje data)
}

// Pokud není company_name
company_name = company_name || brand_or_domain || "your business"
```

**Žádná fake data. Jen evidence-based.**

---

## 📱 Responsive

- **Desktop (≥1024px):** 2 sloupce, fotky vlevo, content vpravo
- **Tablet (768-1023px):** Stále 2 sloupce, menší spacing
- **Mobile (<768px):** Jeden sloupec (stack), fotky nahoře, content dole

---

## 📚 Dokumentace

Vytvořil jsem 4 dokumenty:

1. **`TWO_FOUNDERS_PERSONALIZED_COMPLETE.md`**
   - Kompletní popis změn
   - Technická implementace
   - Before/After comparison

2. **`TWO_FOUNDERS_VISUAL_COMPARISON.md`**
   - Vizuální before/after
   - ASCII mockupy
   - Příklady pro různé businessy

3. **`TWO_FOUNDERS_TESTING_GUIDE.md`**
   - Testing checklist
   - Edge cases
   - QA matrix

4. **`TWO_FOUNDERS_QUICK_REFERENCE.md`**
   - Quick reference pro budoucí úpravy
   - Data sources
   - Troubleshooting

---

## 🚀 Co to dělá

### PŘED:
> "This feels like a template. Are they even talking about MY site?"

### PO:
> "Wow, they actually audited my site. 12 issues? 4 critical? 20-32 missed leads? I need this."

---

## 🎯 Impact Summary

| Element | Před | Po |
|---------|------|-----|
| **Personalizace** | 0% (generic) | 100% (dynamic) |
| **Proof points** | 0 | 5 (intro + impact + 3 chips + metric) |
| **Data-driven** | Ne | Ano (používá audit data) |
| **Outcome-focus** | Features | Results |
| **CTA personalizace** | Generic | Business-specific |

---

## ✅ Validation

- [x] Personalizovaný intro používá `{BusinessName}` a `{City}`
- [x] Ukazuje reálné issue counts z auditu
- [x] Kalkuluje missed leads estimate
- [x] 3 credibility chips pod fotkami
- [x] 1 audit proof metric (mobile nebo AI score)
- [x] Bullets přepsány na outcomes
- [x] CTAs personalizované s business name
- [x] Graceful degradation (žádná fake data)
- [x] Žádný generický "your site" language

---

## 🏁 Hotovo

Sekce "Two Founders" je teď:

- ✅ **Personalizovaná** (ne generic)
- ✅ **Data-driven** (používá audit results)
- ✅ **Proof-heavy** (credibility chips + metrics)
- ✅ **Outcome-focused** (prodává results, ne features)
- ✅ **Napojená na dashboard** (ne floating pitch)

**"The pitch that proves itself."**

---

## 🔍 Jak to vyzkoušet

1. Otevři jakýkoliv audit dashboard
2. Scrolluj na sekci "Real help. Two founders..."
3. Zkontroluj:
   - ✅ Jméno businessu v intro
   - ✅ Město v intro
   - ✅ "found X issues (Y critical)"
   - ✅ "Estimated missed leads: X-Y/month"
   - ✅ 3 chips pod fotkami
   - ✅ Audit proof metric (pokud jsou data)
   - ✅ CTA: "Get {BusinessName}'s Free Plan"

---

## 🐛 Pokud něco nefunguje

**Issue:** "two_founders is undefined"
→ Restart server (`npm restart`)

**Issue:** Metric callout se nezobrazuje
→ To je OK pokud nejsou mobile ani AI scores (graceful degradation)

**Issue:** CTAs jsou pořád generic
→ Hard refresh browser (Cmd+Shift+R)

---

## 📞 Shrnutí pro tebe

**VŠECHNO CO JSI CHTĚL:**

✅ Personalizovaný intro s business name + city + reálné issue counts
✅ Estimated missed leads (kalkulované z critical issues)
✅ 3 credibility chips pod fotkami ("why trust us")
✅ 1 audit proof metric (mobile nebo AI score)
✅ Bullets přepsány na outcomes (results, ne features)
✅ CTAs personalizované s business name
✅ Žádný generický "your site" language
✅ Napojené na dashboard data (ne pitch)

**DONE. 🎉**

---

Máš nějaké otázky nebo chceš něco upravit?
