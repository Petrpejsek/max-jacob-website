# 🚨 EMAIL DELIVERABILITY FIX - Přestaňte padat do spamu!

## ⚡ OKAMŽITÁ AKCE (udělat TERAZ!)

### 1. Zkontrolujte Resend Domain Authentication

**Krok 1: Přejděte na Resend Domains**
```
https://resend.com/domains
```

**Krok 2: Zkontrolujte status `maxandjacob.com`**

Měli byste vidět:
```
✅ Domain verified
✅ SPF: Verified
✅ DKIM: Verified
⚠️ DMARC: Not configured  ← TOTO JE PROBLÉM!
```

**Pokud vidíte ❌ nebo ⚠️ u SPF/DKIM:**
- Klikněte na doménu
- Zkopírujte DNS záznamy
- Přidejte je do vašeho DNS providera (GoDaddy/Cloudflare/etc.)
- Počkejte 5-10 minut
- Klikněte "Verify" v Resend

---

## 🔧 KRITICKÁ OPRAVA: DMARC Setup

**Bez DMARC vás Gmail/Outlook automaticky označí jako spam!**

### Krok 1: Přidejte DMARC záznam do DNS

**V DNS provideru (GoDaddy/Cloudflare/etc.):**

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r;
TTL: 3600
```

**Co to znamená:**
- `p=none` - zatím jen monitorujeme (neblokujeme)
- `rua=mailto:...` - posílat reporty na tento email
- `adkim=r` - relaxed DKIM alignment (nutné pro Resend)
- `aspf=r` - relaxed SPF alignment (nutné pro Resend)

### Krok 2: Ověřte DMARC po 10 minutách

```bash
# V terminálu:
dig TXT _dmarc.maxandjacob.com +short

# Měli byste vidět:
"v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com..."
```

### Krok 3: Po týdnu zpřísněte politiku

Když vidíte, že všechny emaily passují, změňte:
```
v=DMARC1; p=quarantine; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r;
```

Po dalším týdnu (pokud je vše OK):
```
v=DMARC1; p=reject; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r;
```

---

## 📧 Email Content - Odstraňte SPAM triggery

### Běžné spam slova V ČESKÝCH emailech:

**❌ VYHNĚTE SE:**
- "Zdarma" / "Free"
- "Garancované výsledky"
- "Žádné riziko"
- "Ušetříte peníze"
- "Proklikněte zde"
- "Speciální nabídka"
- "100% záruka"
- Příliš mnoho emojis (max 2-3 celkem)
- VELKÝMI PÍSMENY
- !!! vícenásobné vykřičníky !!!

**✅ POUŽÍVEJTE:**
- Konkrétní, faktická tvrzení
- Profesionální tón
- Přirozený jazyk
- Personalizaci (jméno firmy, město, niche)

### Kontrola vašich emailů:

1. **Otevřete admin dashboard:**
   ```
   https://maxandjacob.com/admin/audits/62
   ```

2. **Klikněte "Show Email"**

3. **Zkontrolujte:**
   - ❌ Subject line obsahuje spam slova?
   - ❌ Příliš mnoho odkazů (ideálně max 2-3)?
   - ❌ Chybí unsubscribe link?
   - ❌ Je pouze HTML verze (chybí plain text)?

---

## 🔗 KRITICKÉ: Vypněte Click Tracking (dočasně)

**Click tracking může triggerovat spam filtry!**

### Krok 1: Vypněte v Resend

```
1. https://resend.com/settings/domains
2. Klikněte na maxandjacob.com
3. Configuration → Click Tracking: OFF (toggle vypnuto)
4. Save
```

### Krok 2: Aktualizujte webhook

Protože už nemáte click tracking:
- Jděte na: https://resend.com/webhooks
- Smažte webhook pro `email.clicked`
- Ponechte jen základní webhook (pokud máte)

### Krok 3: Testujte bez trackingu

- Pošlete 5-10 testů na různé emaily
- Zkontrolujte inbox vs spam
- **Pokud už nepadají do spamu**, tracking byl problém!

---

## 🌡️ Email Warming Strategy

**Problém:** Posíláte příliš mnoho emailů najednou z nové domény!

### Denní limity pro warming:

```
Den 1-3:   5-10 emailů/den
Den 4-7:   20 emailů/den
Den 8-14:  50 emailů/den
Den 15-21: 100 emailů/den
Den 22-30: 200+ emailů/den (postupně zvyšujte)
```

### Best practices:

1. **Posílejte v různých časech** (ne všechny najednou)
2. **Variety**: Mírně změňte subject lines mezi emaily
3. **Engagement**: Ideálně začněte s emaily, kde znáte příjemce
4. **Response rate**: Odpovídejte na všechny odpovědi (zvyšuje reputaci)

---

## ✅ Must-Have v každém emailu

### 1. Unsubscribe link (POVINNÉ!)

Přidejte na konec každého emailu:

```html
<p style="font-size: 12px; color: #999; margin-top: 40px;">
  Tento email jste dostali, protože jsme analyzovali vaši webovou stránku.<br>
  <a href="https://maxandjacob.com/unsubscribe?email={{email}}" style="color: #666;">
    Odhlásit se z budoucích emailů
  </a>
</p>
```

### 2. Plain text verze

Vždycky posílejte HTML + plain text:

```javascript
// V emailService.js:
await sendEmail({
  to: recipient,
  subject: subject,
  html: htmlVersion,    // ✅
  text: plainVersion    // ✅ Must have!
});
```

### 3. Proper FROM name

```javascript
// Místo jen "jacob@maxandjacob.com"
from: 'Jacob from Max & Jacob <jacob@maxandjacob.com>'
```

---

## 🧪 Testování deliverability

### Nástroje na testování spamu:

1. **Mail-tester.com** (FREE, nejlepší)
   ```
   1. Otevřete: https://www.mail-tester.com/
   2. Zkopírujte test email: test-xxxxx@mail-tester.com
   3. Pošlete váš audit email na tuto adresu
   4. Zkontrolujte skóre (musí být 8+/10)
   ```

2. **GlockApps** (placené, ale přesné)
   - Testuje Gmail, Outlook, Yahoo, etc.
   - Ukáže inbox placement rate

3. **Manuální test:**
   ```
   Pošlete email na:
   - Gmail účet
   - Outlook/Hotmail účet
   - Seznam.cz účet (pokud posíláte v ČR)
   
   Zkontrolujte:
   - ✅ Inbox nebo ❌ Spam?
   - SPF, DKIM, DMARC pass? (View > Show Original)
   ```

---

## 🔍 Diagnostika - Proč KONKRÉTNĚ padáte do spamu?

### Gmail Headers Check:

1. Otevřete email v Gmailu
2. Klikněte na **"..."** → **"Show original"**
3. Hledejte tyto řádky:

```
SPF: PASS ✅ nebo FAIL ❌?
DKIM: PASS ✅ nebo FAIL ❌?
DMARC: PASS ✅ nebo FAIL ❌?

X-Spam-Score: 2.5  ← Musí být < 5.0
X-Spam-Status: No  ← Musí být "No"
```

### Běžné problémy:

**Problem 1: "DMARC: FAIL"**
- ➡️ Chybí DMARC záznam v DNS (viz výše)

**Problem 2: "SPF: FAIL"**
- ➡️ Resend domain není ověřená
- ➡️ SPF záznam není v DNS

**Problem 3: "X-Spam-Score: 7.2" (vysoké skóre)**
- ➡️ Email content má spam slova
- ➡️ Příliš mnoho odkazů
- ➡️ Chybí unsubscribe link

**Problem 4: "Authentication-Results: none"**
- ➡️ Posíláte z `jacob@maxandjacob.com` ale doména není verified v Resend

---

## 📊 Monitoring & Maintenance

### Sledujte tyto metriky:

```
✅ Inbox placement rate > 90%
✅ Bounce rate < 2%
✅ Complaint rate < 0.1%
✅ Open rate > 15% (realistické)
✅ DMARC reports: 100% pass
```

### Nástroje na monitoring:

1. **Resend Analytics** (built-in)
   - https://resend.com/emails
   - Sledujte delivery rate, bounces

2. **DMARC Analyzer** (free tiers available)
   - Parsuje DMARC reporty
   - Ukáže kdo failuje authentication

3. **Google Postmaster Tools** (FREE!)
   ```
   1. https://postmaster.google.com/
   2. Přidejte maxandjacob.com
   3. Sledujte domain reputation, spam rate
   ```

---

## 🚀 Action Plan - Co udělat TEĎ (v pořadí priority)

### URGENT (do 1 hodiny):

1. ✅ Zkontrolujte Resend domain verification
2. ✅ Přidejte DMARC záznam do DNS
3. ✅ Vypněte click tracking v Resend (dočasně)
4. ✅ Test email na mail-tester.com → skóre 8+?

### HIGH (dnes):

5. ✅ Přidejte unsubscribe link do všech emailů
6. ✅ Přidejte plain text verzi emailů
7. ✅ Zkontrolujte subject lines - odstraňte spam slova
8. ✅ Limit 5-10 emailů dnes (warming)

### MEDIUM (tento týden):

9. ✅ Setup Google Postmaster Tools
10. ✅ Zkontrolujte DMARC reports po 3 dnech
11. ✅ Postupně zvyšujte daily volume (20/day)
12. ✅ Implementujte email variations (3 různé subject lines)

### LOW (dlouhodobě):

13. ✅ Po 2 týdnech: zpřísněte DMARC na `p=quarantine`
14. ✅ Zapněte click tracking zpět (když máte 90%+ inbox rate)
15. ✅ Setup dedicated IP u Resend (pokud posíláte 1000+/měsíc)

---

## 🔗 Užitečné odkazy:

- **Resend Docs**: https://resend.com/docs
- **DMARC Guide**: https://dmarc.org/overview/
- **Mail Tester**: https://www.mail-tester.com/
- **Google Postmaster**: https://postmaster.google.com/
- **MXToolbox**: https://mxtoolbox.com/SuperTool.aspx

---

## ❓ FAQ

**Q: Jak dlouho trvá než se zlepší deliverability?**  
A: S DMARC a bez spam triggerů: 3-7 dní. S warmingem: 2-4 týdny.

**Q: Můžu poslat více emailů když mám DMARC?**  
A: Ano, ale držte se warming schedule. DMARC není zázrak, jen nutnost.

**Q: Click tracking je špatný vždycky?**  
A: Ne. Ale u nových domén s nízkou reputací ano. Zapněte až máte 90%+ inbox rate.

**Q: Kolik stojí dedicated IP?**  
A: U Resend ~$20-50/měsíc. Potřebujete jen když posíláte 10,000+/měsíc.

**Q: Můžu použít "test" subdoménu?**  
A: Ne! Vždy posílejte z produkční domény (maxandjacob.com), jinak budete spam.

---

## ✅ Checklist - Pro každý email:

```
□ SPF: PASS
□ DKIM: PASS
□ DMARC: PASS (po přidání záznamu)
□ Plain text verze: ✅
□ Unsubscribe link: ✅
□ Subject < 60 znaků
□ Žádná spam slova v subject
□ Max 2-3 odkazy v emailu
□ Personalizace (jméno firmy, město)
□ FROM name: "Jacob from Max & Jacob"
□ Mail-tester.com skóre: 8+/10
```

---

**Good luck! 🚀 S těmito úpravami byste měli vidět zlepšení za 3-7 dní.**

**Tip:** Začněte s 5 testy na různé emaily (Gmail, Outlook, Seznam) a sledujte kam padají!
