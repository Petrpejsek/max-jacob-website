# 📧 Email Health Dashboard - Quick Start

## 🎯 CO TO JE?

**One-click email deliverability diagnostika přímo v admin dashboardu!**

Zkontroluje:
- ✅ SPF, DKIM, DMARC záznamy
- ✅ Resend konfiguraci
- ✅ Ukáže přesně co je špatně + jak to opravit

---

## 🚀 JAK TO POUŽÍT

### 1. Otevřete Dashboard

**Lokálně:**
```
http://localhost:3000/admin/email-health
```

**Produkce:**
```
https://yourdomain.com/admin/email-health
```

---

### 2. Klikněte "🔄 Check Health"

Dashboard automaticky:
- Zkontroluje všechny DNS záznamy (live, ne cache!)
- Zobrazí results s ✅/❌
- Ukáže recommendations jak opravit problémy

---

### 3. Výsledky

#### Očekáváte vidět:
```
✅ HEALTHY
All email authentication records properly configured! 🎉

✅ SPF Record - SPF correctly configured
✅ DKIM Signature - DKIM correctly configured  
✅ DMARC Policy - Monitoring mode
✅ Resend Status - Domain configured
```

#### Pokud vidíte problémy:
```
❌ UNHEALTHY
Some email authentication records need attention ⚠️

❌ SPF Record - SPF missing Resend authorization
   Add "include:_spf.resend.com" to SPF record

✅ DKIM Signature - OK
✅ DMARC Policy - OK
```

---

## 💡 POUŽITÍ

### Po DNS změnách:
1. Změníte DNS
2. Počkáte 20-30 min
3. Otevřete dashboard → "Check Health"
4. **Všechno by mělo být ✅ zelené!**

### Při problémech s emaily:
1. Otevřete dashboard
2. Vidíte přesně co je špatně
3. Sekce "Recommendations" ukáže jak to opravit
4. Opravíte → refresh → ✅

### Pravidelný monitoring:
- **1x týdně** - Quick check že všechno funguje
- Mělo by být vždy **✅ HEALTHY**

---

## 🎨 CO VIDÍTE

### Overall Status
- **✅ HEALTHY** - Všechno OK
- **⚠️ WARNING** - Nějaké problémy
- **❌ UNHEALTHY** - Kritické problémy

### Individual Checks
Každý check má:
- Status icon (✅/❌/⚠️)
- Message (co je wrong/right)
- DNS record (zobrazený)
- Details (jak opravit)

### Recommendations
- 🔴 HIGH priority - Opravte hned!
- 🟡 MEDIUM priority - Důležité
- 🔵 LOW priority - Nice to have
- ✅ INFO - Všechno OK

### Quick Links
- Resend Dashboard
- Mail Tester
- MX Toolbox
- Google Postmaster

---

## ⚡ QUICK TIPS

✅ Dashboard dělá **live DNS checks** (ne cache!)  
✅ Po DNS změnách počkejte 20-30 min, pak refresh  
✅ Všechny checks by měly být ✅ zelené  
✅ Recommendations ukážou přesně co opravit  
✅ Funguje na lokálu i v produkci  

---

## 🆚 Dashboard vs CLI Script

**Email Health Dashboard** (`/admin/email-health`):
- 👍 Visual interface
- 👍 One click
- 👍 Color-coded
- 👍 Recommendations
- **→ Pro manual checking**

**CLI Script** (`node scripts/check-email-dns.js`):
- 👍 Terminál
- 👍 Automation-friendly
- 👍 CI/CD ready
- **→ Pro scripting**

---

## 📖 DALŠÍ DOKUMENTACE

- `EMAIL_HEALTH_DASHBOARD.md` - Kompletní dokumentace
- `EMAIL_DELIVERABILITY_FIX.md` - DNS setup guide  
- `EMAIL_TESTING_GUIDE.md` - Testing instrukce

---

**URL:** `http://localhost:3000/admin/email-health`  
**Status:** ✅ Ready to use NOW!  
**Žádné scripty nutné - jen klikněte a vidíte! 🚀**
