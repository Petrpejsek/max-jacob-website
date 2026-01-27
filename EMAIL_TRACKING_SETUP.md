# 📊 Email Tracking Setup (Opens & Clicks)

## ✅ Co je hotové

### 1. Database
- ✅ `email_logs` tabulka rozšířena o tracking sloupce:
  - `opened` (INTEGER) - počet otevření
  - `clicked` (INTEGER) - počet kliknutí
  - `last_opened_at` (DATETIME) - poslední otevření
  - `last_clicked_at` (DATETIME) - poslední kliknutí

### 2. Backend
- ✅ Webhook endpoint: `POST /api/webhooks/resend`
- ✅ Funkce `updateEmailTracking()` v `db.js`
- ✅ Email service zapnut click tracking
- ✅ Admin routes předávají tracking data do UI

### 3. Frontend
- ✅ Seznam auditů (`/admin/audits`) zobrazuje:
  - **✅ sent** - zelený badge (email odeslán)
  - **👁️ X** - počet otevření (modré)
  - **🔗 X** - počet kliknutí (zelené)

---

## 🔧 Nastavení Resend Webhooků

### Krok 1: Zapnout Click Tracking v Resend

1. Přejděte na: https://resend.com/settings/domains
2. Klikněte na svou doménu `maxandjacob.com`
3. V sekci **"Configuration"**:
   - **Click Tracking**: Zapnout ✅ (toggle ON)
   - **Open Tracking**: Nechat vypnuté ❌ (není doporučeno - snižuje deliverability)

### Krok 2: Přidat Webhook v Resend

#### A) Pro Localhost (testování):

1. Přejděte na: https://resend.com/webhooks
2. Klikněte **"Create Webhook"**
3. Vyplňte:
   - **Name**: `Max&Jacob Localhost Tracking`
   - **Endpoint URL**: `https://[VAŠE_NGROK_URL]/api/webhooks/resend`
     
     > **Poznámka**: Localhost webhooky vyžadují veřejnou URL. Použijte:
     > - **ngrok**: `ngrok http 3000` (free tier má 2h limity)
     > - **localtunnel**: `npx localtunnel --port 3000`
     > - **Cloudflare Tunnel**: Trvalé řešení bez limitů

4. **Events** - zaškrtněte:
   - ✅ `email.clicked` (kliknutí na odkaz)
   - ❌ `email.opened` (NEvybírejte - open tracking je vypnutý)

5. Klikněte **"Create"**

#### B) Pro Production (Render):

1. Přejděte na: https://resend.com/webhooks
2. Klikněte **"Create Webhook"**
3. Vyplňte:
   - **Name**: `Max&Jacob Production Tracking`
   - **Endpoint URL**: `https://maxandjacob.com/api/webhooks/resend`

4. **Events** - zaškrtněte:
   - ✅ `email.clicked`

5. Klikněte **"Create"**

---

## 🧪 Testování

### 1. Localhost:

```bash
# Spusťte ngrok (v novém terminálu)
ngrok http 3000

# Získáte URL jako: https://abc123.ngrok.io
# Použijte ji v Resend webhook: https://abc123.ngrok.io/api/webhooks/resend
```

### 2. Pošlete test email:

1. Otevřete: `http://localhost:3000/admin/audits/57`
2. Klikněte **"Show Email"**
3. Zadejte váš email
4. Klikněte **"📧 Send Email"**

### 3. Testujte tracking:

1. **Otevřete email** ve schránce
2. **Klikněte na odkaz** v emailu (např. "Audit - Company Name")
3. Počkejte 30 sekund (webhook delay)
4. Refreshněte: `http://localhost:3000/admin/audits`
5. Měli byste vidět:
   - **🔗 1** (1 kliknutí)

---

## 🔍 Debugging

### Ověření webhooků v Resend:

1. Přejděte na: https://resend.com/webhooks
2. Klikněte na svůj webhook
3. Karta **"Attempts"** - uvidíte všechny pokusy a jejich status
4. Pokud vidíte **200 OK** - webhook funguje ✅
5. Pokud vidíte **4xx/5xx** - zkontrolujte endpoint URL

### Logy na serveru:

```bash
# V terminálu kde běží server uvidíte:
[RESEND WEBHOOK] Received event: email.clicked
[RESEND WEBHOOK] Email clicked tracked: re_abc123xyz
```

### Test webhook endpointu:

```bash
# Ověřte, že endpoint odpovídá
curl -X POST http://localhost:3000/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -d '{"type":"email.clicked","data":{"email_id":"test-123"}}'

# Mělo by vrátit: {"received":true}
```

---

## 📊 Co se zobrazuje v seznamu:

### Když není email odeslán:
```
⚠️ No email    (oranžová - chybí email ve scrape datech)
✓              (zelená - email existuje, ale nebyl odeslán)
```

### Když je email odeslán:
```
✅ sent
```

### Když někdo klikne na odkaz:
```
✅ sent
🔗 1           (1 kliknutí)
```

### Příklad s více akcemi:
```
✅ sent
🔗 3           (3 kliknutí)
```

---

## ⚠️ Poznámky

1. **Open tracking je VYPNUTÝ** - není doporučeno pro deliverability
2. **Click tracking je ZAPNUTÝ** - doporučeno, neovlivňuje deliverability
3. Webhooky fungují jen pro **emaily odeslané po zapnutí trackingu**
4. Pro localhost potřebujete veřejnou URL (ngrok, localtunnel, Cloudflare Tunnel)
5. Tracking data jsou **kumulativní** - opakované kliknutí se sčítají

---

## 🚀 Ready to go!

Vše je implementováno a funkční. Stačí:

1. ✅ Zapnout Click Tracking v Resend (Configuration)
2. ✅ Přidat webhook v Resend
3. ✅ Poslat test email
4. ✅ Kliknout na odkaz v emailu
5. ✅ Vidět tracking data v seznamu auditů

**Necommitováno - čeká na vaši instrukci!** 🎉
