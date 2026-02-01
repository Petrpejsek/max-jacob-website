# 📹 Microsoft Clarity Page Tracking Setup

## ✅ Co je hotové

### 1. Database
- ✅ `audit_page_views` tabulka pro tracking návštěv:
  - `audit_job_id` - ID auditu
  - `viewed_at` - čas návštěvy
  - `clarity_session_id` - Clarity session ID
  - `user_agent` - browser info
  - `ip_address` - IP návštěvníka

### 2. Backend
- ✅ Tracking endpoint: `POST /api/track-page-view`
- ✅ DB funkce: `createPageView()`, `getPageViewsByJobId()`, `getAllPageViewsStatus()`
- ✅ Email odkazy obsahují tracking parametr: `?audit_id=62`
- ✅ Admin routes předávají page view data do UI

### 3. Frontend
- ✅ Microsoft Clarity script integrovaný na audit stránkách
- ✅ Automatické zachycení `audit_id` z URL parametru
- ✅ Automatické získání Clarity session ID
- ✅ Custom tag v Clarity pro filtrování: `audit_id: 62`
- ✅ Seznam auditů (`/admin/audits`) zobrazuje:
  - **▶️ X** - Play button + počet návštěv (kliknutelný odkaz na Clarity session)
  - **👀 X** - Počet návštěv (když nemáme Clarity session ID)

---

## 🎯 Jak to funguje

### 1. Email obsahuje tracking odkaz
```
https://maxandjacob.com/audit-plumbing-miami?v=2&audit_id=62
```

### 2. Zákazník klikne na odkaz
- Resend zachytí klik (🔗 counter se inkrementuje)
- Zákazník je přesměrován na vaši stránku

### 3. Audit stránka trackuje návštěvu
- Clarity začne nahrávat session
- JavaScript zachytí `audit_id=62` z URL
- Počká na Clarity session ID (max 10s)
- Pošle tracking event na váš server:
  ```json
  {
    "audit_id": 62,
    "clarity_session_id": "abc123xyz"
  }
  ```
- Nastaví Clarity custom tag: `audit_id: 62`

### 4. Admin dashboard zobrazí výsledky
```
✅ sent          (email odeslán)
🔗 6             (6 prokliků v emailu)
▶️ 3             (3 návštěvy stránky - play button kliknutelný!)
```

---

## 🔧 Microsoft Clarity Setup

### Krok 1: Registrace v Microsoft Clarity

1. Přejděte na: https://clarity.microsoft.com/
2. Přihlaste se Microsoft účtem (nebo vytvořte nový)
3. Klikněte **"Create new project"**
4. Vyplňte:
   - **Project name**: Max & Jacob Audits
   - **Website URL**: `https://maxandjacob.com`
   - **Industry**: Business Services
5. Klikněte **"Create project"**

### Krok 2: Najít Clarity Project ID

Po vytvoření projektu najdete **Project ID** v nastavení:

1. V Clarity dashboardu klikněte na **Settings** (⚙️ ikona)
2. V sekci **"Setup"** najdete **Project ID**: `vaor3tcykv`
3. **✅ HOTOVO**: Project ID je již nastaveno v kódu:

```javascript
// V audit-public-v2.ejs:
clarity", "script", "vaor3tcykv");  // ✅ Vaše Project ID
```

4. Pokud v budoucnu budete chtít změnit ID, upravte `server/views/audit-public-v2.ejs`:
   - Najděte řádek: `})(window, document, "clarity", "script", "vaor3tcykv");`
   - Nahraďte `vaor3tcykv` za nové **Project ID**

### Krok 3: Ověření, že tracking funguje

1. **Spusťte server** (pokud ještě neběží):
   ```bash
   node server/server.js
   ```

2. **Pošlete test email**:
   - Otevřete: `http://localhost:3000/admin/audits`
   - Vyberte libovolný audit (např. #62)
   - Klikněte **"Show Email"**
   - Zadejte váš email
   - Klikněte **"📧 Send Email"**

3. **Otevřete email** a klikněte na audit odkaz

4. **Zkontrolujte tracking v konzoli serveru**:
   ```bash
   [PAGE VIEW TRACKING] Tracked view for audit #62 (Clarity: abc123xyz)
   ```

5. **Zkontrolujte admin dashboard**:
   - Otevřete: `http://localhost:3000/admin/audits`
   - U řádku #62 byste měli vidět: **▶️ 1** (play button)

6. **Klikněte na play button** - měl by se otevřít Clarity dashboard s nahrávkou session

---

## 🎥 Jak používat Clarity recordings

### Zobrazit konkrétní session:

1. V admin dashboardu klikněte na **▶️ play button** u auditu
2. Otevře se Clarity s nahrávkou session
3. Můžete vidět:
   - Co zákazník dělal na stránce
   - Jak dlouho zůstal
   - Kam klikal
   - Jak scrolloval
   - Rage clicks, dead clicks, excessive scrolling

### Filtrovat sessions podle auditu:

1. Přejděte na: https://clarity.microsoft.com/projects/view/vaor3tcykv/dashboard
2. Klikněte na **"Recordings"**
3. V filtru vyberte **"Custom tags"**
4. Zadejte: `audit_id: 62` (pro konkrétní audit)
5. Uvidíte všechny sessions pro daný audit

### Sdílet session s klientem:

1. Otevřete session v Clarity
2. Klikněte na **"Share"** (ikona sdílení)
3. Zkopírujte odkaz
4. Pošlete klientovi - může vidět nahrávku bez registrace

---

## 📊 Co vidíte v admin dashboardu

### Když není email odeslán:
```
⚠️ No email    (oranžová - chybí email)
✓              (zelená - email existuje, ale nebyl odeslán)
```

### Když je email odeslán:
```
✅ sent
```

### Když někdo klikne na odkaz v emailu:
```
✅ sent
🔗 2           (2 prokliky v emailu)
```

### Když někdo navštíví stránku:
```
✅ sent
🔗 2           (2 prokliky v emailu)
▶️ 1           (1 návštěva stránky - kliknutelný play button!)
```

### Příklad s více akcemi:
```
✅ sent
🔗 6           (6 prokliků v emailu)
▶️ 3           (3 návštěvy stránky - play button vede na poslední session)
```

---

## 🔍 Debugging

### Ověření Clarity tracking scriptu:

1. Otevřete audit stránku v browseru
2. Otevřete **Developer Console** (F12)
3. Zkontrolujte, že Clarity script se načetl:
   ```javascript
   console.log(window.clarity); // Mělo by vrátit funkci
   ```

4. Zkontrolujte session ID:
   ```javascript
   if (window.clarity) {
     console.log(window.clarity.getSessionId());
   }
   ```

### Test tracking endpointu:

```bash
# Ověřte, že endpoint odpovídá
curl -X POST http://localhost:3000/api/track-page-view \
  -H "Content-Type: application/json" \
  -d '{"audit_id": 62, "clarity_session_id": "test-123"}'

# Mělo by vrátit: {"success":true,"id":1}
```

### Zkontrolovat DB záznam:

```sql
-- V SQLite konzoli:
SELECT * FROM audit_page_views ORDER BY viewed_at DESC LIMIT 10;
```

### Logy na serveru:

```bash
# V terminálu kde běží server uvidíte:
[PAGE VIEW TRACKING] Tracked view for audit #62 (Clarity: abc123xyz)
```

---

## 🎯 Co můžete sledovat

### V Clarity dashboardu:
- **Heatmapy** - kam návštěvníci klikají
- **Scroll depth** - jak daleko scrollují
- **Time on page** - jak dlouho zůstávají
- **Rage clicks** - frustrace (opakované klikání)
- **Dead clicks** - klikání na nekliknutelné elementy
- **JavaScript errors** - technické problémy
- **Device info** - desktop/mobile, prohlížeč, rozlišení

### V admin dashboardu:
- Počet návštěv stránky
- Poslední návštěva
- Přímý odkaz na Clarity session

---

## ⚠️ Poznámky

1. **Clarity session ID** - získává se až po inicializaci Clarity (500ms - 10s)
2. **Tracking funguje jen s `audit_id` parametrem** - staré odkazy bez parametru nebudou trackované
3. **Privacy** - Clarity automaticky maskuje citlivá data (hesla, credit cards)
4. **Free tier** - Clarity je 100% zdarma, bez limitů
5. **GDPR** - doporučuji přidat cookie consent banner (např. Cookiebot)
6. **Retention** - Clarity ukládá data 90 dní (free tier)

---

## 🚀 Ready to go!

Vše je implementováno a funkční. Pro použití v produkci:

1. ✅ Zkontrolujte Clarity Project ID v `audit-public-v2.ejs`
2. ✅ Pošlete test email a ověřte tracking
3. ✅ Zkontrolujte play button v admin dashboardu
4. ✅ Otevřete Clarity dashboard a prohlédněte si první nahrávku
5. ✅ (Volitelné) Přidejte cookie consent banner

**Necommitováno - čeká na vaši instrukci!** 🎉
