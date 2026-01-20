# Niche Presets – Testing Checklist

## ✅ Pre-test Setup

Server již běží na `http://localhost:3000` (nebo na Render URL v produkci).

## 🧪 Test 1: Vytvoření nového preset

### Kroky:
1. Přihlaste se do admin: `/admin/login`
2. Přejděte na libovolný Audit Job detail (nebo vytvořte nový)
3. Klikněte na tlačítko **"Presets"** v horní liště
4. Modal by se měl otevřít s dvěma taby: "Presets List" a "Create / Edit Preset"
5. Klikněte na **"Create New Preset"**
6. Vyplňte formulář:
   - **Display Name**: "Plumbing"
   - **Slug**: "plumbing" (měl by se auto-generate)
   - **Concept Image**: Nahrajte libovolný obrázek (PNG/JPG, max 5MB)
     - Můžete použít placeholder nebo screenshot nějakého plumbing webu
   - **Default Headline**: "More calls from your Miami plumbing website"
   - **Primary CTA**: "Get a Quote"
   - **Secondary CTA**: "Call Now"
   - **Default City**: "Miami"
   - **Bullets**:
     - Bullet 1: "Fast 24/7 response"
     - Bullet 2: "Licensed & insured"
     - Bullet 3: "Free estimates"
7. Klikněte **"Save Preset"**

### Očekávaný výsledek:
- Alert: "Preset created successfully"
- Modal přepne zpět na "Presets List" tab
- V listu by měl být nový preset "Plumbing" s thumbnailem (nebo placeholder)
- Preset by měl zobrazovat display name, slug a headline

---

## 🧪 Test 2: Editace preset

### Kroky:
1. V modalu "Presets" na tab "Presets List"
2. Klikněte na **"Edit"** u preset "Plumbing"
3. Změňte **Default Headline** na: "Get more plumbing leads in Miami"
4. Klikněte **"Save Preset"**

### Očekávaný výsledek:
- Alert: "Preset updated successfully"
- V listu by se měl preset aktualizovat s novým headline

---

## 🧪 Test 3: Použití preset v Audit Job

### Kroky:
1. Zavřete modal "Presets"
2. V sekci **A) Input** najděte dropdown **"Niche Preset"**
3. Vyberte "Plumbing" z dropdown
4. Měl by se zobrazit **"Preset Preview"** pod formulářem

### Očekávaný výsledek:
- Preview obsahuje:
  - Concept image (thumbnail)
  - Headline: "Get more plumbing leads in Miami"
  - Primary CTA: "Get a Quote"
  - Secondary CTA: "Call Now"
  - Bullets: "Fast 24/7 response", "Licensed & insured", "Free estimates"

---

## 🧪 Test 4: Spuštění audit s preset

### Kroky:
1. Vyplňte formulář Input:
   - **URL**: `https://example.com` (nebo libovolná URL)
   - **Niche**: "plumbing"
   - **City**: "Miami"
   - **Company Name**: "Test Plumbing Co."
   - **Niche Preset**: "Plumbing" (již vybráno)
2. Klikněte **"Process"**
3. Počkejte na dokončení pipeline (30-60 sekund)

### Očekávaný výsledek:
- Status se změní na "ready"
- V sekci **D) Outputs** zkontrolujte:

#### Email HTML:
- Obsahuje concept image z presetu (ne screenshot above-fold)
- CTA text: "Get a Quote"
- Disclaimer: "This is a concept example for plumbing businesses in Miami, not your current website..."

#### Public Landing URL:
- Klikněte na public URL
- **Concept Preview sekce** by měla zobrazovat:
  - Headline: "Get more plumbing leads in Miami"
  - Primary CTA: "Get a Quote"
  - Secondary CTA: "Call Now"
  - Bullets: "Fast 24/7 response", "Licensed & insured", "Free estimates"
  - **Concept image** (ne screenshot)
  - Label: "This is a concept example for plumbing businesses in Miami, not your current website."
- **Form CTA**: "Get a Quote" (nebo default "Get pricing range + next steps")

---

## 🧪 Test 5: Smazání preset

### Kroky:
1. Otevřete modal "Presets"
2. Klikněte na **"Delete"** u preset "Plumbing"
3. Potvrďte smazání v popup

### Očekávaný výsledek:
- Alert: "Preset deleted successfully"
- Preset zmizí z listu
- Asociovaný obrázek by měl být smazán z `public/presets/`

---

## 🧪 Test 6: Fallback (job bez presetu)

### Kroky:
1. Vytvořte nový Audit Job nebo editujte existující
2. V dropdown **"Niche Preset"** vyberte **"No preset"**
3. Spusťte "Process"

### Očekávaný výsledek:
- Pipeline proběhne normálně
- Email použije screenshot above-fold (ne concept image)
- Public page použije screenshot (ne concept image)
- CTA texty jsou z LLM suggestions nebo default values

---

## 🧪 Test 7: API Endpoints (volitelné, cURL)

### GET /api/presets
```bash
curl -X GET http://localhost:3000/api/presets \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**Očekávaný výsledek**: JSON seznam všech presetů

### POST /api/presets (vytvoření)
```bash
curl -X POST http://localhost:3000/api/presets \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -F "display_name=HVAC" \
  -F "slug=hvac" \
  -F "default_headline=Reliable HVAC services in Miami" \
  -F "default_primary_cta=Schedule Service" \
  -F "concept_image=@/path/to/image.png"
```

**Očekávaný výsledek**: 201 Created + `{ "id": X, "message": "Preset created successfully" }`

---

## 🐛 Known Issues / Edge Cases

### 1. Upload validation
- Zkuste nahrát soubor > 5MB → měla by být chyba
- Zkuste nahrát neplatný typ (např. .txt) → měla by být chyba

### 2. Unique slug
- Vytvořte 2 presety se stejným slugem → druhý by neměl být vytvořen (error: "Preset with this slug already exists")

### 3. Empty preset dropdown
- Pokud neexistují žádné presety, dropdown by měl zobrazovat pouze "No preset"

### 4. Image loading
- Zkontrolujte, že obrázky se správně načítají v:
  - Preset preview (v input formuláři)
  - Email HTML (inline image)
  - Public page (concept preview sekce)

---

## ✅ Success Criteria

- [x] Presets lze vytvářet, editovat a mazat
- [x] Upload obrázků funguje (drag & drop + browse)
- [x] Dropdown preset v audit job zobrazuje presety
- [x] Preview se zobrazuje po výběru preset
- [x] Email používá concept image a CTA z presetu
- [x] Public page používá concept image a texty z presetu
- [x] Disclaimery jsou viditelné všude
- [x] Fallback funguje (job bez presetu používá screenshot)

---

**Status**: ✅ Ready for testing  
**Last updated**: 2026-01-15

