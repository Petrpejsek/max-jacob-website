# V2 Audit Stránka - Vymazlená Verze ✅

## Datum: 2026-01-16

---

## 🎨 Co bylo vymazleno

### **Hlavní změny** - Čistota, Hierarchie, Funnel Flow

---

## 1. Screenshot sekce - PIN + SEZNAM (místo chaotických bublin)

### ❌ Před (chaos):
- Velké červené bubliny s textem
- Překrývaly screenshot
- Působilo jako spam

### ✅ Po (čisto):
- **Malé číslované piny** (1, 2, 3) - nenápadné, čisté
- **Seznam problémů vedle** screenshotu
- **Hover interakce**: při najetí na položku seznamu se:
  - Zvýrazní příslušný pin
  - Zobrazí se jemný highlight na screenshotu (červený border + průhledné pozadí)
- **JavaScript** pro interaktivitu (mouseenter/mouseleave)

### Struktura:
```
Screenshot (s piny)          Seznam problémů
┌─────────────────┐          ┌─────────────────────┐
│                 │          │ (1) CTA není vidět  │
│    (1)          │   ←───→  │ (2) Chybí kontakt   │
│         (2)     │          │ (3) Málo důvěry     │
│              (3)│          └─────────────────────┘
└─────────────────┘
```

---

## 2. Odstraněny duplicity - Jeden jasný story

### ❌ Před:
- Opakované sekce
- Nejasný flow
- Působilo jako 2 stránky

### ✅ Po - Jasná cesta:
```
1. HERO + Screenshot (aha moment)
   ↓
2. Rychlý přehled (3 karty - scoreboard)
   ↓
3. Top 3 brzdy (hlavní prodejní část)
   ↓
4. CTA sekce (po brzdách)
   ↓
5. Co dodáme v 7 dnech (deliverables)
   ↓
6. FORM (konverze)
   ↓
7. Debug (collapsed)
```

**Žádné opakování. Jeden příběh.**

---

## 3. Typografie + Spacing - "Víc vzduchu, méně prázdna"

### Vylepšení:
- **H1**: 3rem → 2-3rem (responsive)
- **H2**: 2rem (jasně odlišené)
- **Body**: 1rem / 0.95rem
- **Spacing**: Konzistentní 40-60px mezi sekcemi
- **Padding v kartách**: 22-28px (ne 40px)
- **Bullets zkráceny**: Max 2-3 položky v evidence

### Trust microtext:
```
"Bez garancí. Jen konkrétní kroky, podložené tím, co na webu vidíme."
```
- Pod subheadline v hero
- Světle šedý box s modrým borderem
- Uklidňující, ne prodejní

---

## 4. "3 největší brzdy" - Sales-friendly karty

### Nová struktura každé karty:

```
┌─────────────────────────────────────────┐
│ (1) [Titulek problému]      [Low] [High]│  ← Číslo + badges
│                                          │
│ Proč to brzdí: [1 řádek]                │  ← Krátké vysvětlení
│                                          │
│ Co upravit:                              │
│  → Krok 1                                │
│  → Krok 2                                │
│  → Krok 3                                │
│                                          │
│ ▼ Z čeho to víme (accordion)            │  ← Evidence (collapsed)
└─────────────────────────────────────────┘
```

### Badges:
- **Effort**: Low / Med / High
- **Impact**: Low / Med / High
- Barevné (zelená/žlutá/červená)
- Konzistentní styl

### Evidence accordion:
- Collapsed by default
- Malý text "Z čeho to víme"
- Při rozbalení: max 3 evidence refs
- Nenápadné, ne technické

---

## 5. CTA Flow - Přirozená konverze

### Umístění CTA:
1. **Hero** - Primary + Secondary button
2. **Po Top 3 brzdách** - Nová CTA sekce (modrý gradient box)
3. **Form** - Finální konverze

### CTA sekce (nová):
```
┌─────────────────────────────────────┐
│  Připraveni začít?                  │
│  Pojďme společně odstranit...       │
│                                     │
│  [Získat 7denní akční plán]        │
└─────────────────────────────────────┘
```
- Světle modrý gradient background
- Centrovaný text
- Jeden button (konzistentní text)

### Konzistence:
- **Všechny CTA** mají stejný text: "Získat 7denní akční plán"
- **Primární barva**: `#2563eb` (solid blue)
- **Hover**: Elevace + tmavší odstín

---

## 6. Premium drobnosti

### Trust microtext ✅
- Pod subheadline
- Šedý box s modrým borderem
- "Bez garancí. Jen konkrétní kroky..."

### Karty sjednoceny ✅
- **Border**: 1px solid #e5e7eb
- **Radius**: 12px všude
- **Shadow**: 0 2px 8px rgba(0,0,0,0.04)
- **Hover**: Elevace + border modrý

### Badge styl ✅
- **Konzistentní**: Všechny badges stejný styl
- **Barvy**: Zelená (good) / Žlutá (med) / Červená (bad)
- **Velikost**: 0.75rem, uppercase, bold
- **Padding**: 4px 10px

### Spacing ✅
- **Sekce**: 50px padding (desktop), 40px (mobile)
- **Mezi kartami**: 20-24px gap
- **V kartách**: 22-28px padding
- **Mezi elementy**: 10-16px

---

## 7. Interaktivita (JavaScript)

### Pin hover efekt:
```javascript
// Při najetí na pin nebo položku seznamu:
1. Zvýrazní se příslušný pin (scale 1.15)
2. Zobrazí se highlight na screenshotu (opacity 1)
3. Highlight = červený border + průhledné pozadí
```

### Implementace:
- Event listeners na `.pin` a `.pin-item`
- `mouseenter` → přidá class `active` na highlight
- `mouseleave` → odebere class `active`
- Smooth transition (0.3s)

---

## 📊 Porovnání: Před vs Po

| Aspekt | Před (V2 initial) | Po (V2 polished) |
|--------|-------------------|------------------|
| **Screenshot** | Velké červené bubliny | Malé piny + seznam |
| **Interaktivita** | Žádná | Hover highlights |
| **Duplicity** | Opakované sekce | Jeden jasný story |
| **Spacing** | Nekonzistentní | Konzistentní 40-60px |
| **Typografie** | OK | Lepší hierarchie |
| **CTA flow** | 2 CTA | 3 CTA (strategicky) |
| **Trust** | Chybí | Microtext v hero |
| **Badges** | Nekonzistentní | Sjednocené |
| **Evidence** | Vždy viditelné | Accordion (collapsed) |
| **Karty** | Různé styly | Sjednocené |

---

## 🎯 Funnel Flow (finální)

```
HERO (Above-the-fold)
├─ Headline + Subheadline
├─ Trust microtext
├─ 3 bullets
├─ 2 CTA buttons
└─ Screenshot + Piny + Seznam
    ↓
SCOREBOARD (3 karty)
├─ Lead Friction
├─ Trust Signals
└─ Clarity
    ↓
TOP 3 BRZDY (hlavní prodej)
├─ Issue #1 (číslo, title, badges, why, fix, evidence)
├─ Issue #2
└─ Issue #3
    ↓
CTA SEKCE (po brzdách)
└─ "Připraveni začít?" + button
    ↓
DELIVERABLES (4 karty)
├─ Copy + struktura
├─ Form + CTA flow
├─ Trust bloky
└─ Checklist změn
    ↓
FORM (konverze)
├─ 5 polí (name, email, website, budget, role)
└─ CTA button: "Chci akční plán"
    ↓
DEBUG (collapsed)
```

---

## 📱 Responsive

### Desktop (>968px):
- 2 sloupce v hero
- 3 sloupce scoreboard
- Piny + seznam vedle sebe

### Mobile (<968px):
- 1 sloupec všude
- Screenshot nahoře, seznam dole
- Piny menší (24px)
- Issue karty: číslo + title stack
- Full-width buttons

---

## 🔧 Technické detaily

### Soubory změněny:
1. **`server/helpers/auditViewModelV2.js`**
   - `buildAhaMoment()` → vrací `pins` místo `callouts`
   - `shortenPin()` → max 50 znaků
   - `calculateEffortImpact()` → vrací `Low/Med/High`

2. **`server/views/audit-public-v2.ejs`**
   - Kompletní přepsání (~900 řádků)
   - Nový CSS (čistší, konzistentnější)
   - JavaScript pro pin interakce
   - Odstraněny duplicity
   - Jeden jasný funnel

### Nové CSS třídy:
- `.pin` - Malé číslované piny
- `.pin-highlight` - Highlight overlay (invisible by default)
- `.pin-list` - Seznam problémů
- `.pin-item` - Položka seznamu
- `.trust-text` - Trust microtext v hero
- `.cta-section` - CTA sekce po brzdách
- `.badge` - Sjednocené badges
- `.issue-badges` - Container pro effort/impact

### JavaScript:
```javascript
// Pin hover interactions
pins.forEach(el => {
  el.addEventListener('mouseenter', () => {
    highlight.classList.add('active');
  });
  el.addEventListener('mouseleave', () => {
    highlight.classList.remove('active');
  });
});
```

---

## ✅ Checklist (hotovo)

- ✅ Screenshot: Piny + seznam místo bublin
- ✅ Hover interakce (highlight na screenshotu)
- ✅ Odstraněny duplicity
- ✅ Jeden jasný funnel story
- ✅ Typografie vylepšena
- ✅ Spacing konzistentní
- ✅ Trust microtext přidán
- ✅ CTA flow optimalizován (3 CTA)
- ✅ Badges sjednoceny
- ✅ Evidence jako accordion
- ✅ Karty sjednoceny (border, shadow, radius)
- ✅ Sales-friendly issue karty
- ✅ Responsive design
- ✅ JavaScript interaktivita

---

## 🚀 Test URLs

**V2 Polished** (s `?v=2`):
```
http://localhost:3000/plumbingmiami/audit-5bd1f4?v=2
http://localhost:3000/plumbingmiami/audit-dfeb58?v=2
http://localhost:3000/plumbingmiami/audit-c2ab25?v=2
```

**Admin panel** (Open odkazy automaticky vedou na V2):
```
http://localhost:3000/admin/audits
```

---

## 📝 Co testovat

### 1. Screenshot interakce:
- [ ] Najeď na pin → highlight se zobrazí
- [ ] Najeď na položku seznamu → highlight se zobrazí
- [ ] Odjeď → highlight zmizí
- [ ] Pin se zvětší při hoveru

### 2. Funnel flow:
- [ ] Hero → Scoreboard → Issues → CTA → Deliverables → Form
- [ ] Žádné opakování
- [ ] Jasný příběh

### 3. Typografie:
- [ ] H1 > H2 > body (jasná hierarchie)
- [ ] Čitelné na mobilu
- [ ] Spacing konzistentní

### 4. CTA:
- [ ] 3 CTA (hero, po issues, form)
- [ ] Všechny stejný text
- [ ] Vedou na #form

### 5. Mobile:
- [ ] Screenshot + piny responsive
- [ ] Seznam pod screenshotem
- [ ] Karty stack
- [ ] Buttons full-width

---

## 🎉 Summary

**Status**: ✅ **Vymazleno & Hotovo**

**Změny**:
- Screenshot: Piny + seznam + hover interakce
- Odstraněny duplicity
- Jeden jasný funnel
- Trust microtext
- Sjednocené karty a badges
- 3 CTA strategicky umístěné
- Sales-friendly issue karty

**Výsledek**: Čistá, marketingová, premium stránka s jasným funnelem

**Ready for**: User testing → A/B test → Production

---

**Server běží**: http://localhost:3000
**Test URL**: http://localhost:3000/plumbingmiami/audit-5bd1f4?v=2
