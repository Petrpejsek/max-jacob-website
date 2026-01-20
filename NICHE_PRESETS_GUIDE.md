# Niche Presets – Implementační průvodce

## Co je implementováno

Systém **Niche Presets** umožňuje vytvořit a spravovat předvolby pro různé niche (např. plumbing, roofing, hvac), které obsahují:

- **Display name** a **slug** (unikátní identifikátor)
- **Concept preview image** (nahraný obrázek)
- **Default CTA texty** (headline, primary CTA, secondary CTA)
- **Default bullets** (až 3 krátké body s benefity)
- **Default city** (volitelně)

## Jak to funguje

### 1. Správa presetů (Admin UI)

V detailu Audit Job je nové tlačítko **"Presets"**, které otevře modal s dvěma taby:

#### Tab A: Presets List
- Zobrazuje všechny vytvořené presety
- Každý preset má thumbnail (nebo placeholder), display name, slug a headline
- Možnost **Edit** nebo **Delete** každého presetu
- Tlačítko **"Create New Preset"** otevře formulář

#### Tab B: Create/Edit Preset Form
Formulář obsahuje:
- **Display Name*** (povinné, např. "Plumbing")
- **Slug*** (automaticky generovaný z display name, ale editovatelný)
- **Concept Image** – drag & drop nebo kliknutím upload (PNG, JPG, WEBP, max 5MB)
  - Obrázek se ukládá do `public/presets/{slug}-{timestamp}.{ext}`
  - Zobrazuje se mini preview po výběru
- **Default Headline** (např. "More calls from your Miami plumbing website")
- **Primary CTA** (např. "Get a Quote")
- **Secondary CTA** (např. "Call Now")
- **Default City** (volitelně, např. "Miami")
- **3 Benefits Bullets** (3 inputy pro krátké body)

Tlačítka:
- **Save Preset** – uloží do DB
- **Cancel** – vrátí se na list

### 2. Použití presetu v Audit Job

V sekci **A) Input** je nové pole:

#### Dropdown "Niche Preset"
- Nabízí všechny vytvořené presety + možnost "No preset"
- Po výběru preset se zobrazí **Preset Preview** s:
  - Concept image (pokud existuje)
  - Headline, Primary CTA, Secondary CTA
  - Bullets (pokud jsou vyplněny)

Když vytvoříte nebo spustíte audit job s vybraným presetem, tento preset ovlivní:

### 3. Výstupy – Email a Public Page

#### Email (HTML)
- Pokud má job přiřazený preset:
  - **Concept image** z presetu (místo screenshot above-fold)
  - **CTA text** z presetu (default_primary_cta)
  - Label: _"Concept preview for your industry"_ + disclaimer:
    > "This is a concept example for {niche} businesses in {city}, not your current website. We'll tailor it after a short intake. No guarantees or performance promises."

#### Public Page (EJS)
- **Concept Preview sekce**:
  - Headline z presetu (s placeholdery `{city}` a `{niche}`)
  - Primary + Secondary CTA z presetu
  - Benefits bullets z presetu
  - **Concept image** z presetu (pokud existuje) místo screenshot
  - Label: _"This is a concept example for {niche} businesses in {city}, not your current website."_
- **Form CTA** z presetu
- **Disclaimer** v CTA note s jasnou formulací

## API Endpoints

Pro Presets jsou k dispozici následující API endpointy (všechny vyžadují admin session):

### `GET /api/presets`
Vrací seznam všech presetů (JSON).

### `GET /api/presets/:id`
Vrací detail jednoho presetu (JSON).

### `POST /api/presets`
Vytvoří nový preset.
- Body: `multipart/form-data`
- Pole: `slug`, `display_name`, `concept_image` (file), `default_headline`, `default_primary_cta`, `default_secondary_cta`, `default_city`, `default_bullets_json` (JSON string nebo newline/comma separated)

### `PUT /api/presets/:id`
Aktualizuje preset.
- Body: `multipart/form-data` (stejné pole jako POST)
- Při změně obrázku se starý obrázek automaticky smaže

### `DELETE /api/presets/:id`
Smaže preset včetně asociovaného obrázku.

## Databázové změny

### Nová tabulka: `niche_presets`
```sql
CREATE TABLE niche_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  concept_image_url TEXT,
  default_headline TEXT,
  default_primary_cta TEXT,
  default_secondary_cta TEXT,
  default_city TEXT,
  default_bullets_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Změny v tabulce `audit_jobs`
Přidáno pole:
- `preset_id INTEGER` (foreign key na `niche_presets.id`)

## Workflow

### Typický použití

1. **Admin vytvoří preset**:
   - Klikne na "Presets" → "Create New Preset"
   - Vyplní display name (např. "Plumbing")
   - Nahraje concept preview image (např. mockup plumbing webu)
   - Vyplní default headline: _"More calls from your Miami plumbing website"_
   - Vyplní primary CTA: _"Get a Quote"_
   - Vyplní secondary CTA: _"Call Now"_
   - Přidá 3 bullets (např. "Fast 24/7 response", "Licensed & insured", "Free estimates")
   - Uloží

2. **Admin vytvoří Audit Job**:
   - V detailu jobu vybere z dropdown "Niche Preset" → "Plumbing"
   - Zobrazí se preview s concept image a CTA texty
   - Vyplní URL, niche, city, company name
   - Spustí "Process"

3. **Pipeline běží**:
   - Scrape + screenshot (jak obvykle)
   - LLM evaluace (jak obvykle)
   - **Email generování** – použije concept image a CTA z presetu
   - **Public page generování** – použije concept image, headline, CTA z presetu

4. **Výsledek**:
   - Email obsahuje concept preview z presetu s jasným labelem
   - Public page zobrazuje concept preview s disclaimer
   - Klient vidí "example layout for your industry", ne fake personalizovaný mockup

## Bezpečnost a compliance

✅ **Disclaimer vždy přítomen**:
> "This is a concept example for {niche} businesses in {city}, not your current website. We'll tailor it after a short intake."

✅ **Labels na obrázcích**:
- Email: _"Concept preview for your industry"_
- Public page: _"This is a concept example for {niche} businesses in {city}, not your current website."_

✅ **Žádné fake personalizované mockupy**:
- Concept image je "template preview" pro daný niche, ne individualizovaný redesign

✅ **Upload restrictions**:
- Max 5MB
- Pouze PNG, JPG, JPEG, WEBP
- Validace na backendu (multer)

## Soubory upravené/vytvořené

### Backend
- `server/db.js` – přidána tabulka + CRUD funkce pro presety
- `server/routes/presets.js` – nový modul s API routes pro presety (včetně upload)
- `server/routes/admin.js` – přidána podpora `preset_id` v create/update audit job
- `server/services/auditPipeline.js` – upraveny funkce pro generování email/public page (načítají preset a používají jeho data)
- `server/server.js` – registrován nový preset router

### Frontend
- `server/views/admin-audit-detail.ejs` – přidán Presets button + modal s taby + preset dropdown + preview
- `server/views/audit-public.ejs` – upravena Concept Preview sekce pro použití preset image + disclaimers

### Další
- `package.json` – přidán `multer` (file upload middleware)
- `public/presets/` – nový adresář pro concept images (auto-vytváří se)

## Testování

Pro manuální test:

1. Spusťte server: `npm start`
2. Přihlaste se do admin: `/admin/login`
3. Přejděte na detail nějakého Audit Job (nebo vytvořte nový)
4. Klikněte na **"Presets"**
5. Vytvořte nový preset:
   - Display Name: "Plumbing"
   - Slug: "plumbing"
   - Nahrajte concept image (nějaký generický obrázek plumbing webu)
   - Headline: "More calls from your {city} {niche} website"
   - Primary CTA: "Get a Quote"
   - Secondary CTA: "Call Now"
   - Bullets: "Fast 24/7 response", "Licensed & insured", "Free estimates"
   - Uložte
6. V input sekci vyberte preset "Plumbing" z dropdown
7. Zkontrolujte preview (měl by se zobrazit obrázek + texty)
8. Spusťte "Process"
9. Po dokončení zkontrolujte:
   - **Email HTML** (v Output sekci) – měl by obsahovat concept image z presetu
   - **Public page** (klikněte na public URL) – měl by zobrazovat concept preview s disclaimery

## Poznámky k implementaci

- **MVP scope**: Override texty per job zatím není implementováno (pouze preset default values)
- **LLM suggestions**: LLM může generovat své vlastní CTA suggestions, ale ty **neoverrideují** preset defaults – to je záměrné (preset je "truth source")
- **City placeholders**: Headline z presetu může obsahovat `{city}` a `{niche}` – ty se nahradí skutečnými hodnotami z jobu
- **Fallback**: Pokud job nemá přiřazený preset, používají se původní hodnoty (LLM suggestions nebo hardcoded defaults)
- **Image fallback**: Pokud preset nemá concept image, použije se screenshot (above-fold) jako fallback

## Co dále?

V budoucnu můžete přidat:
- **Override fields per job** (např. `job_headline_override`) pro fine-tuning
- **LLM suggestion approval** (tlačítko "Apply LLM suggestion" pro CTA texty)
- **Multiple concept images per preset** (např. varianta A, B, C)
- **Preset templates** (více layoutů pro jeden niche)
- **Analytics** (kolik jobů používá daný preset, conversion rate)

---

**Implementováno:** 2026-01-15  
**Autor:** Cursor AI Assistant  
**Status:** ✅ Kompletní MVP implementace

