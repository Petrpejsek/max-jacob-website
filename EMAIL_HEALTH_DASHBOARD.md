# 📧 Email Health Dashboard - Dokumentace

**Vytvořeno:** 2. února 2026  
**Umístění:** `/admin/email-health`

---

## 🎯 CO TO JE?

Email Health Dashboard je **real-time diagnostický nástroj** přímo v admin dashboardu, který jedním kliknutím zkontroluje:

✅ **DNS záznamy** (SPF, DKIM, DMARC)  
✅ **Resend konfiguraci**  
✅ **Email deliverability status**  
✅ **Doporučení** jak opravit problémy  

**Žádný terminál, žádné scripty - jen klik a vidíte stav!**

---

## 🚀 JAK TO POUŽÍVAT

### 1. Otevřete Dashboard

```
http://localhost:3000/admin/email-health
```

nebo v produkci:

```
https://yourdomain.com/admin/email-health
```

---

### 2. Klikněte "Check Health"

Dashboard automaticky zkontroluje:
- SPF record
- DKIM signature  
- DMARC policy
- Resend domain status

---

### 3. Prohlédněte Výsledky

Dashboard zobrazí:

#### Overall Status
```
✅ HEALTHY - Všechny záznamy správně nastavené
⚠️  WARNING - Nějaké problémy vyžadují pozornost
❌ UNHEALTHY - Kritické problémy
```

#### Individual Checks
Každý check zobrazuje:
- ✅/❌ Status
- Popis problému
- DNS záznam (pokud existuje)
- Konkrétní instrukce jak opravit

#### Recommendations
Prioritizované doporučení:
- 🔴 HIGH - Kritické (musí se opravit)
- 🟡 MEDIUM - Důležité (doporučeno opravit)
- 🔵 LOW - Nice to have
- ✅ INFO - Všechno OK

---

## 📊 CO SE KONTROLUJE

### SPF Record
```
✅ Obsahuje include:_spf.resend.com
✅ Správný formát (v=spf1 ... -all)
```

**Příklad správného:**
```
v=spf1 include:secureserver.net include:_spf.resend.com -all
```

---

### DKIM Signature
```
✅ resend._domainkey.maxandjacob.com existuje
✅ Začíná s p=
✅ Verified v Resend dashboardu
```

---

### DMARC Policy
```
✅ _dmarc.maxandjacob.com existuje
✅ Jen JEDEN záznam (ne duplicity)
✅ Správná policy (p=none/quarantine/reject)
```

**Příklad správného:**
```
v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r
```

---

### Resend Status
```
ℹ️  Domain configured in Resend
Link na Resend dashboard pro ověření
```

---

## 🔄 REFRESH / UPDATE

Dashboard **NEPRACUJE s cache** - každé kliknutí na "Check Health" spustí nové live DNS dotazy.

**Použití:**
- Po změně DNS záznamů (počkejte 15-30 min na propagaci)
- Pravidelná kontrola (např. jednou týdně)
- Při problémech s doručitelností emailů
- Po přidání nové domény v Resend

---

## 🎨 VIZUALIZACE

### Color Coding

**Zelená (✅):** Všechno OK
```
SPF: PASS
DKIM: PASS
DMARC: PASS
```

**Žlutá (⚠️):** Warning
```
Multiple DMARC records found
```

**Červená (❌):** Fail - musí se opravit
```
SPF missing Resend authorization
```

**Modrá (ℹ️):** Info
```
Domain configured in Resend
```

---

## 🔗 QUICK LINKS

Dashboard obsahuje přímé linky na:
- **Resend Dashboard** - Verify domény, analytics
- **Mail Tester** - Test email deliverability
- **MX Toolbox** - DNS diagnostika
- **Google Postmaster** - Gmail reputation monitoring

---

## 💡 POUŽITÍ V PRAXI

### Scenář 1: Po DNS změnách

1. Změníte DNS záznamy
2. Počkáte 20-30 minut
3. Otevřete `/admin/email-health`
4. Kliknete "Check Health"
5. **Očekáváte:** Všechna ✅ zelená

---

### Scenář 2: Emaily jdou do spamu

1. Otevřete `/admin/email-health`
2. Kliknete "Check Health"
3. Dashboard ukáže problémy:
   ```
   ❌ SPF: FAIL - Missing Resend authorization
   ```
4. V sekci "Recommendations":
   ```
   🔴 Fix SPF Record
   Add "include:_spf.resend.com" to your SPF TXT record
   ```
5. Opravíte podle instrukce
6. Za 30 min refresh → ✅ všechno zelené!

---

### Scenář 3: Pravidelný monitoring

**Doporučeno:** Kontrola 1x týdně

1. Pondělí ráno otevřete dashboard
2. Quick check - měli byste vidět:
   ```
   ✅ HEALTHY
   All email authentication records properly configured!
   ```
3. Pokud vidíte ⚠️ nebo ❌ → opravte hned

---

## 🛠️ TECHNICKÉ DETAILY

### Backend API

```
GET /admin/api/email-health
```

**Response:**
```json
{
  "success": true,
  "overall": {
    "status": "healthy",
    "message": "All email authentication records properly configured!",
    "timestamp": "2026-02-02T10:30:00Z",
    "duration_ms": 1234
  },
  "checks": {
    "spf": {
      "status": "pass",
      "message": "SPF correctly configured",
      "record": "v=spf1 include:secureserver.net include:_spf.resend.com -all"
    },
    "dkim": {...},
    "dmarc": {...},
    "resend": {...}
  },
  "recommendations": [...]
}
```

---

### DNS Checking

Dashboard používá `dig` command pro live DNS dotazy:
```bash
dig TXT maxandjacob.com +short        # SPF
dig TXT resend._domainkey.maxandjacob.com +short  # DKIM
dig TXT _dmarc.maxandjacob.com +short # DMARC
```

**Výhody:**
- ✅ Real-time data (ne cache)
- ✅ Stejné výsledky jako `node scripts/check-email-dns.js`
- ✅ Funguje na lokálu i v produkci

---

## 📱 RESPONSIVE DESIGN

Dashboard je plně responsivní:
- **Desktop:** Grid layout, 4 check cards
- **Tablet:** 2 columns
- **Mobile:** Single column, stackovaný layout

---

## 🔒 SECURITY

Dashboard je **chráněný admin autentizací**:
```javascript
router.get('/email-health', requireAdmin, ...)
```

Jen přihlášení admini mohou vidět email health data.

---

## 🎯 BEST PRACTICES

### Po DNS změnách:
1. Počkejte **20-30 minut** na propagaci
2. Refreshujte dashboard
3. Ověřte že všechny checks jsou ✅

### Pravidelný monitoring:
- **Denně:** První týden po nastavení
- **Týdně:** Po stabilizaci
- **Měsíčně:** Po dlouhodobém úspěšném běhu

### Při problémech:
1. Otevřete dashboard → vidíte konkrétní problém
2. Sledujte recommendations → přesné instrukce
3. Opravte DNS
4. Za 30 min refresh → verify fix

---

## 🆚 DASHBOARD vs CLI SCRIPT

### Email Health Dashboard:
✅ Visual interface  
✅ One click refresh  
✅ Color-coded results  
✅ Recommendations + quick links  
✅ Dostupný odkudkoliv (web browser)  

### CLI Script (`check-email-dns.js`):
✅ Terminál-based  
✅ Good for CI/CD  
✅ Automation-friendly  
✅ Stejná data jako dashboard  

**Doporučení:** Použijte dashboard pro manual checking, CLI script pro automation.

---

## 📚 SOUBORY

### Backend:
```
server/services/emailHealthCheck.js  - Health check logic
server/routes/admin.js               - API endpoint + view route
```

### Frontend:
```
server/views/admin-email-health.ejs  - Dashboard UI
```

### Dokumentace:
```
EMAIL_HEALTH_DASHBOARD.md            - Tento soubor
EMAIL_DELIVERABILITY_FIX.md          - DNS setup guide
EMAIL_TESTING_GUIDE.md               - Testing instructions
```

---

## 🎉 SHRNUTÍ

**Email Health Dashboard je one-stop řešení pro monitoring email deliverability:**

✅ Jedním kliknutím vidíte stav všech DNS záznamů  
✅ Real-time data (ne cache)  
✅ Vizuální interface s color-coding  
✅ Konkrétní doporučení jak opravit problémy  
✅ Přístupný z admin dashboardu  

**Žádné scripty, žádný terminál - jen čistý web interface! 🚀**

---

**URL:** `/admin/email-health`  
**Vytvořeno:** 2. února 2026  
**Pro:** Max & Jacob  
**Status:** ✅ Ready to use!
