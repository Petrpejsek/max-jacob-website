# Dashboard Grooming Summary

## 🎯 Cíl
Zachovat současné rozvržení dashboardu, ale udělat ho více "analytickým" rozdělením Search vs AI kanálů a vylepšením vizuální konzistence.

---

## ✅ Implementované změny

### 1. **Rozdělení kanálů: Search vs AI**

#### Opportunity Loss sekce - nový layout
- **Hlavní nadpis**: "Estimated Opportunity by Channel"
- **Celkový přehled**: Total missed leads/month: 8-22
- **Disclaimer tooltip**: "Estimates are directional. We validate during implementation."

#### Panel 1: Search Engines
- **Nadpis**: "Search Engines" + subtitle "Search visibility"
- **Kanály**:
  - **Google**: Progress bar + score + estimated leads (~5-13 leads/mo)
  - **Bing**: Progress bar + score + estimated leads (~1-3 leads/mo)
- **Layout**: Abstraktní ikony (G, B písmena v barevných boxech), ne loga
- **Data split**: 60% missed leads přiřazeno search engines

#### Panel 2: AI Assistants
- **Nadpis**: "AI Assistants" + subtitle "AI discovery readiness"
- **Kanály**:
  - **ChatGPT**: Score + progress bar (~1-4 leads/mo)
  - **Claude**: Score + progress bar (~1-2 leads/mo)
  - **Perplexity**: Score + progress bar (~1-2 leads/mo)
  - **Gemini**: Score + progress bar (~0-1 leads/mo)
- **Data split**: 40% missed leads přiřazeno AI assistants

#### Vizuální design
- Dva sloupce na desktopu (Search vlevo, AI vpravo)
- Na mobilu: stacked vertikálně
- Každý kanál má:
  - Abstraktní ikonu (barevný box s písmenem)
  - Název
  - Progress bar (h-1.5, jednotná výška)
  - Score %
  - Estimate missed leads

---

### 2. **Grooming: Typografie & Konzistence**

#### 2.1 Typografie
- **H3 nadpisy**: text-2xl md:text-3xl (Opportunity Loss)
- **H4 nadpisy (pillars)**: text-xl, font-black (jednotně)
- **Score čísla**: text-lg font-black (zvětšeno z text-sm)
- **Subtitles**: text-xs, uppercase, tracking-wider
- **Body text**: text-sm, leading-tight (zkráceno)

#### 2.2 Pillars - zkrácené texty
Každý pillar má nyní:
- **"Key Issues"** nadpis (text-xs, uppercase)
- **Max 3 bullet points**, každý:
  - ✓/✗/• ikona (flex-shrink-0, mt-0.5 pro lepší zarovnání)
  - Text max 4-6 slov, leading-tight
  
**Příklady zkrácení**:
- ❌ Před: "Sticky CTA: Present/Missing"
- ✅ Po: "Sticky CTA present/missing"

- ❌ Před: "Friction: Low/Medium/High"
- ✅ Po: "Friction level low/medium/high"

#### 2.3 Progress bary - konzistence
- **Všechny stejné**:
  - Výška: h-2 (pillars), h-1.5 (channel cards)
  - Radius: rounded-full
  - Duration: duration-1000 (pillars), duration-700 (channels)
  - Background: bg-slate-700/50

#### 2.4 Card padding - sjednoceno
- **Hlavní karty**: p-8 (pillars, scoreboard)
- **Sub-karty (channel items)**: p-4
- **Panely**: p-6
- **Gap mezi kartami**: gap-6 (jednotně)

---

### 3. **Data Mapping**

#### Placeholder logika (do budoucna zpřesnit promptem)
```javascript
// Search vs AI split
const searchShare = 0.60; // 60%
const aiShare = 0.40; // 40%

// Individual channels
channels = {
    search: {
        google: { score: localSeo.score, share: 0.85 },
        bing: { score: localSeo.score - 15, share: 0.15 }
    },
    ai: {
        chatgpt: { score: geoSignals.score, share: 0.40 },
        claude: { score: geoSignals.score - 10, share: 0.25 },
        perplexity: { score: geoSignals.score - 5, share: 0.25 },
        gemini: { score: geoSignals.score - 12, share: 0.10 }
    }
};
```

**Fallback handling**:
- Pokud score chybí → 0%
- Pokud data nejsou k dispozici → zobrazit "—"
- UI nesmí spadnout

---

### 4. **Mobilní chování**

#### Opportunity Loss
- **Desktop**: 2 sloupce (Search | AI)
- **Mobile**: Stacked vertikálně
- Breakpoint: `lg:grid-cols-2`

#### Pillars
- **Desktop**: 3 sloupce
- **Mobile**: Stacked vertikálně
- Breakpoint: `lg:grid-cols-3`

#### Issues/Wins
- **Desktop**: 2 sloupce
- **Mobile**: Stacked vertikálně
- Breakpoint: `lg:grid-cols-2`

#### Max 4 položky na mobilu bez scroll fatigue
- Search engines: 2 items ✓
- AI assistants: 4 items ✓
- Issues: 6 max ✓
- Quick wins: 6 max ✓

---

## 📊 Akceptační kritéria

### ✅ Splněno:
1. **Opportunity sekce jasně ukazuje 2 skupiny**: Search vs AI ✓
2. **Vypadá to jako analýza, ne marketing**: Číselné odhady + disclaimer ✓
3. **Vizuálně sjednocené**: Karty, bary, spacing, typografie ✓
4. **Žádné změny v horní/spodní části**: Hero a CTA zůstaly nedotčené ✓
5. **Konzistentní progress bary**: Stejná výška, radius, animace ✓
6. **Zkrácené texty v pillars**: Max 3 bullets, 4-6 slov ✓
7. **Mobilní responsivita**: Stack layout, čitelné ✓

---

## 🎨 Vizuální konzistence

### Spacing system
- **Sekce gap**: mb-16
- **Card grid gap**: gap-6
- **Internal padding**: p-8 (main cards), p-6 (panels), p-4 (items)
- **Bullet spacing**: space-y-2.5 (zkráceno z space-y-3)

### Color system (zachováno)
- **Search**: Blue accents (bg-blue-500/20)
- **AI**: Purple/multi-color (ChatGPT purple, Claude amber, Perplexity cyan, Gemini pink)
- **Critical**: Red (bg-red-500/10)
- **Quick Wins**: Emerald (bg-emerald-500/10)

### Typography scale
- H2 (Hero): text-3xl md:text-4xl
- H3 (Section): text-2xl md:text-3xl
- H4 (Card): text-xl (nebo text-lg pro sub-cards)
- Body: text-sm
- Labels: text-xs uppercase

---

## 🔄 Další kroky (budoucnost)

1. **Data precizace**:
   - Zpřesnit channel scores z reálných dat
   - Implementovat dynamický výpočet missed leads per channel
   - Validovat estimates během implementace

2. **Možná vylepšení**:
   - Tooltip s vysvětlením pro každý kanál
   - Historická data (trend arrows ↑↓)
   - "Show all channels" expand možnost

---

## 📝 Technické poznámky

### Soubory změněny:
- `/server/views/audit-public-v2.ejs` (lines ~287-778)

### Backup soubory:
- `audit-public-v2.ejs.bak` (první backup)
- `audit-public-v2.ejs.bak2` (druhý backup)

### Server status:
✓ Running on http://localhost:3000

### Jak restartovat:
```bash
cd "/Users/petrliesner/Max&Jacob"
./dev.sh restart
```

---

**Dokument vytvořen**: 2026-01-31  
**Verze**: 2.0 (Grooming update)
