# 🚀 Production Deploy - Clarity Tracking

## ✅ Pre-Deploy Checklist

### 1. Environment Variables v Render Dashboard

Přejděte na: **Render Dashboard → Your Service → Environment**

Ujistěte se, že máte nastavené:

```bash
# ✅ Již nastavené (hopefully):
ADMIN_PASSWORD=your_admin_password
SESSION_SECRET=your_session_secret
OPENROUTER_API_KEY=sk-or-v1-...

# ✅ KRITICKÉ - zkontrolujte že je nastavený:
RESEND_API_KEY=re_...

# ✅ Automaticky nastavené Renderem:
NODE_ENV=production
DB_PATH=/opt/render/project/data/data.db
PUBLIC_DIR=/opt/render/project/data/public
```

### 2. Microsoft Clarity - Production Setup

#### A) Clarity Project je již vytvořený ✅
- Project ID: `vaor3tcykv`
- Již nakonfigurováno v kódu

#### B) Nastavte Resend webhook pro PRODUKCI:

1. Přejděte na: https://resend.com/webhooks
2. Klikněte **"Create Webhook"**
3. Vyplňte:
   ```
   Name: Max&Jacob Production Tracking
   Endpoint URL: https://maxandjacob.com/api/webhooks/resend
   ```
4. **Events** - zaškrtněte:
   - ✅ `email.clicked` (kliknutí na odkaz)
   
5. Klikněte **"Create"**

#### C) Zapněte Click Tracking v Resend:

1. Přejděte na: https://resend.com/settings/domains
2. Klikněte na vaši doménu `maxandjacob.com`
3. V sekci **"Configuration"**:
   - **Click Tracking**: Zapnout ✅ (toggle ON)
   
---

## 🚢 Deploy Steps

### Krok 1: Commit & Push změn

```bash
git add .
git commit -m "Add Microsoft Clarity page tracking with session recordings"
git push origin main
```

### Krok 2: Render Auto-Deploy

- Render automaticky detekuje push na `main` branch
- Deploy začne automaticky (pokud máte `autoDeploy: true` v `render.yaml`)
- Sledujte logy v Render dashboardu

### Krok 3: Ověření po deployi

1. **Zkontrolujte databázi:**
   - V Render logs by mělo být: `Table audit_page_views ready`

2. **Test tracking endpointu:**
   ```bash
   curl -X POST https://maxandjacob.com/api/track-page-view \
     -H "Content-Type: application/json" \
     -d '{"audit_id": 1, "clarity_session_id": "test"}'
   
   # Mělo by vrátit: {"success":true,"id":1}
   ```

3. **Pošlete test email:**
   - Přejděte na: `https://maxandjacob.com/admin/audits`
   - Vyberte audit → Send Email
   - Otevřete email → klikněte na audit odkaz
   - Navštivte audit stránku

4. **Zkontrolujte admin dashboard:**
   - Refreshněte: `https://maxandjacob.com/admin/audits`
   - Měli byste vidět: **▶️ 1** (play button)
   - Klikněte na play button → otevře se Clarity

5. **Zkontrolujte Clarity:**
   - Přejděte na: https://clarity.microsoft.com/projects/view/vaor3tcykv/dashboard
   - Po 2-3 minutách byste měli vidět novou session

---

## 🔧 Co je nového v produkci

### Database změny:
- ✅ Nová tabulka: `audit_page_views`
- ✅ Auto-vytvoří se při startu serveru
- ✅ Ukládá: audit_id, clarity_session_id, user_agent, IP

### API Endpoints:
- ✅ `POST /api/track-page-view` - veřejný endpoint pro tracking
- ✅ `POST /api/webhooks/resend` - již existující, žádné změny

### Frontend změny:
- ✅ Clarity tracking script na všech audit stránkách
- ✅ Automatické zachycení session ID
- ✅ Custom tag: `audit_id: XX` pro snadné filtrování

### Admin Dashboard:
- ✅ Play button ▶️ vedle každého auditu
- ✅ Počet návštěv stránky
- ✅ Přímý odkaz na Clarity session recording

---

## 🐛 Troubleshooting

### Problem: Play button nefunguje

**Příčina:** Clarity session není zachycen nebo ještě není zpracován

**Řešení:**
1. Počkejte 2-3 minuty po návštěvě (Clarity processing time)
2. Zkontrolujte Render logs: `[PAGE VIEW TRACKING] Tracked view for audit #X`
3. Pokud není Clarity session ID, zkontrolujte že script se načítá:
   ```javascript
   // V browser console na audit stránce:
   console.log(window.clarity);
   console.log(window.clarity.getSessionId());
   ```

### Problem: Page views se neukladají

**Příčina:** Endpoint nefunguje nebo není dostupný

**Řešení:**
1. Test endpoint:
   ```bash
   curl -X POST https://maxandjacob.com/api/track-page-view \
     -H "Content-Type: application/json" \
     -d '{"audit_id": 1}'
   ```
2. Zkontrolujte Render logs pro chyby
3. Zkontrolujte databázi: `SELECT * FROM audit_page_views;`

### Problem: Clarity nezobrazuje sessions

**Příčina:** Clarity Project ID je špatně nebo není nakonfigurovaný

**Řešení:**
1. Zkontrolujte Project ID v `audit-public-v2.ejs`:
   ```javascript
   clarity", "script", "vaor3tcykv");  // Musí být VAŠE ID
   ```
2. Zkontrolujte že Clarity script se načítá (Network tab v DevTools)
3. Zkontrolujte Clarity dashboard - může trvat až 5 minut

### Problem: Email click tracking nefunguje

**Příčina:** Resend webhook není nastavený nebo Click Tracking není zapnutý

**Řešení:**
1. Zkontrolujte webhook v Resend: https://resend.com/webhooks
2. Zkontrolujte Click Tracking: https://resend.com/settings/domains
3. Zkontrolujte Render logs: `[RESEND WEBHOOK] Email clicked tracked`

---

## 📊 Očekávané výsledky v produkci

### Admin Dashboard - příklad řádku:

```
#62 | Jan 30, 2026 | plumbing | miami | https://miamishore...
    ✅ sent          (email odeslán)
    🔗 6             (6 prokliků v emailu - z Resend webhook)
    ▶️ 3             (3 návštěvy stránky - KLIKNUTELNÝ!)
```

### Když kliknete na ▶️:
- Otevře se: `https://clarity.microsoft.com/projects/view/vaor3tcykv/sessions/SESSION_ID`
- Uvidíte celou nahrávku session - co zákazník dělal na stránce! 🎥

---

## ✅ Post-Deploy Verification

Po úspěšném deployi:

1. ✅ Server běží bez errorů
2. ✅ Tabulka `audit_page_views` existuje
3. ✅ Endpoint `/api/track-page-view` odpovídá 200 OK
4. ✅ Clarity script se načítá na audit stránkách
5. ✅ Email odkazy obsahují `?audit_id=XX`
6. ✅ Admin dashboard zobrazuje play button
7. ✅ Resend webhook posílá click events
8. ✅ Clarity zachycuje sessions

---

## 🎯 Ready for Production!

Všechno je připravené a otestované. Po deployi můžete:

- 📧 Posílat emaily zákazníkům
- 🔗 Trackovat prokliky v emailu
- 👀 Sledovat návštěvy audit stránek
- 🎥 Přehrávat session recordings v Clarity
- 📊 Analyzovat user behavior

**Happy deploying!** 🚀
