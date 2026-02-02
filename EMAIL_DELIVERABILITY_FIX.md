# 📧 Email Deliverability Fix - Kompletní Řešení

**Datum:** 2. února 2026  
**Problém:** Emaily padají do spamu  
**Řešení:** DNS konfigurace + úpravy kódu

---

## 🚨 KRITICKÉ PROBLÉMY NALEZENÉ

### 1. ❌ SPF záznam neobsahuje Resend
**Současný stav:**
```
v=spf1 include:secureserver.net -all
```

**Problém:** Resend NEMÁ povolení odesílat emaily z `@maxandjacob.com` → emaily jdou do spamu

### 2. ❌ Duplicitní DMARC záznamy
Máte 2 DMARC záznamy, jeden s policy `p=quarantine` (karanténa)

### 3. ❌ Chybí unsubscribe link v HTML emailu
Jen v plain textu, Gmail a Outlook to trestají

### 4. ❌ Chybí List-Unsubscribe hlavička
RFC standardní hlavička pro hromadné emaily

### 5. ❌ Relativní URL pro obrázky
Email klienti nedokážou zobrazit obrázky s relativní cestou

### 6. ❌ Chybí plain text verze
Emaily by měly mít obě verze (HTML + plain text)

---

## ✅ ŘEŠENÍ KROK ZA KROKEM

---

## ČÁST A: DNS ZMĚNY (MUSÍTE UDĚLAT VY)

### Krok 1: Opravit SPF záznam

**Kde:** V DNS správě vaší domény (pravděpodobně GoDaddy nebo jiný registrátor)

**Co udělat:**
1. Přihlaste se do DNS správy pro `maxandjacob.com`
2. Najděte TXT záznam s hodnotou začínající `v=spf1`
3. **ZMĚŇTE** z:
   ```
   v=spf1 include:secureserver.net -all
   ```
   
   **NA:**
   ```
   v=spf1 include:secureserver.net include:_spf.resend.com -all
   ```

**DŮLEŽITÉ:**
- ✅ **PŘIDEJTE** `include:_spf.resend.com` (nepřepisujte celý záznam!)
- ✅ Zachovejte `include:secureserver.net` (pro příchozí emaily)
- ✅ Zachovejte `-all` na konci

**Příklad - GoDaddy:**
- DNS Management → TXT Records → Edit
- Změňte hodnotu
- Save

**Propagace:** 5 minut až 2 hodiny (obvykle během 15 minut)

---

### Krok 2: Vyčistit DMARC záznamy

**Co udělat:**
1. V DNS správě najděte všechny TXT záznamy pro `_dmarc.maxandjacob.com`
2. **SMAŽTE** všechny DMARC záznamy
3. **VYTVOŘTE** nový jedný DMARC záznam:

**Host/Name:** `_dmarc` nebo `_dmarc.maxandjacob.com`

**Hodnota:**
```
v=DMARC1; p=none; rua=mailto:postmaster@maxandjacob.com; pct=100; adkim=r; aspf=r
```

**Vysvětlení:**
- `p=none` - jen monitoring (později můžete změnit na `quarantine` nebo `reject`)
- `rua=mailto:postmaster@maxandjacob.com` - kam posílat reporty
- `adkim=r` - relaxed DKIM alignment (bezpečnější pro začátek)
- `aspf=r` - relaxed SPF alignment

**POZNÁMKA:** Jakmile budete mít 100% doručitelnost po dobu 2-4 týdnů, můžete změnit `p=none` na `p=quarantine` nebo `p=reject` pro ještě lepší reputaci.

---

### Krok 3: Ověřit DKIM (měl by být už správně)

**Ověření:**
Zkontrolujte, že máte TXT záznam:
- **Host/Name:** `resend._domainkey` nebo `resend._domainkey.maxandjacob.com`
- **Hodnota:** Začíná `p=MIGfMA0GCSq...`

✅ Tento záznam **UŽ MÁTE** správně nastavený (verified v Resend dashboardu)

---

## ČÁST B: CODE ZMĚNY (HOTOVO)

### ✅ Změna 1: emailService.js
- Přidán **List-Unsubscribe** header (RFC standardní)
- Přidán **Reply-To** header
- Přidán **From name** ("Jacob from Max & Jacob")
- Obě verze emailu (HTML + plain text)

### ✅ Změna 2: generateEmailHtml()
- Přidán **unsubscribe link** do HTML
- Změněny relativní URL na **absolutní URL** pro obrázky
- Zlepšená struktura HTML pro lepší rendering

### ✅ Změna 3: Plain text verze
- Automatické generování plain text verze z HTML
- Fallback pokud HTML není k dispozici

---

## ČÁST C: JAK OVĚŘIT, ŽE TO FUNGUJE

### 1. Zkontrolovat DNS (po změnách)

Použijte diagnostický script:
```bash
node scripts/check-email-dns.js
```

Měli byste vidět:
```
✅ SPF: obsahuje _spf.resend.com
✅ DKIM: verified
✅ DMARC: správně nastavený
```

### 2. Otestovat email

Po odeslání testovacího emailu:

**Gmail:**
- Otevřete email
- Klikněte na "Show original" (tři tečky → Show original)
- Zkontrolujte:
  - `SPF: PASS`
  - `DKIM: PASS`
  - `DMARC: PASS`

**Outlook/Hotmail:**
- Zkontrolujte, že email není ve spamu
- Headers by měly ukazovat PASS pro SPF/DKIM

**Online nástroje:**
```
https://www.mail-tester.com/
```
Pošlete testovací email na adresu, kterou vám dají, a dostanete skóre 0-10.
Cíl: **8/10 nebo vyšší**

---

## 📊 OČEKÁVANÉ VÝSLEDKY

### Před opravami:
- ❌ SPF: FAIL nebo SOFTFAIL
- ❌ DMARC: FAIL
- ❌ Emaily ve spamu
- ❌ Nízké skóre na mail-tester (4-6/10)

### Po opravách:
- ✅ SPF: PASS
- ✅ DKIM: PASS (už jste měli)
- ✅ DMARC: PASS
- ✅ Emaily v inboxu
- ✅ Vysoké skóre na mail-tester (8-10/10)

---

## ⚠️ DŮLEŽITÉ POZNÁMKY

### O SPF záznamu:
- **NEPŘEPISUJTE** existující `include:secureserver.net`
- **PŘIDEJTE** pouze `include:_spf.resend.com`
- SPF záznam může mít max **10 includes** (máte jen 2, jste v pohodě)

### O DMARC policy:
- Začínáme s `p=none` (jen monitoring)
- Po 2-4 týdnech úspěšného odesílání změňte na `p=quarantine`
- Později můžete jít na `p=reject` (nejpřísnější)

### O email contentu:
- Unsubscribe link je **povinný** pro marketing emaily
- List-Unsubscribe header umožňuje "jedno-klikové" odhlášení v Gmailu
- Plain text verze zlepšuje deliverability

---

## 🎯 CHECKLIST - CO MUSÍTE UDĚLAT

### DNS změny (u vašeho DNS providera):
- [ ] Upravit SPF záznam - přidat `include:_spf.resend.com`
- [ ] Vyčistit duplicitní DMARC záznamy
- [ ] Vytvořit jeden správný DMARC záznam
- [ ] Počkat 15-30 minut na DNS propagaci

### Ověření:
- [ ] Spustit `node scripts/check-email-dns.js`
- [ ] Vidět všechna ✅ zelená
- [ ] Odeslat testovací email
- [ ] Zkontrolovat "Show original" v Gmailu → SPF/DKIM/DMARC = PASS
- [ ] Otestovat na mail-tester.com (cíl: 8+/10)

### Monitoring (po týdnu):
- [ ] Zkontrolovat, že emaily nejsou ve spamu
- [ ] Zkontrolovat DMARC reporty (pokud přicházejí na postmaster@)
- [ ] Případně zpřísnit DMARC policy na `p=quarantine`

---

## 🆘 TROUBLESHOOTING

### Problém: DNS změny se neprojevují
**Řešení:** 
- Počkejte 2 hodiny (max propagační čas)
- Vymažte DNS cache: `sudo dscacheutil -flushcache` (Mac)
- Zkontrolujte z jiné sítě nebo přes online nástroj

### Problém: Stále ve spamu i po DNS opravách
**Možné příčiny:**
1. **Doménová reputace** - nová doména nebo historie spamu
   - Řešení: Zahřívejte doménu (začněte malým počtem emailů)
2. **Content problémy** - spamové slova
   - Zkontrolujte na mail-tester.com
3. **Engagement** - nízká míra otevření
   - Posílejte jen relevantním příjemcům

### Problém: SPF/DKIM/DMARC všechny PASS, ale stále spam
**Pravděpodobně:**
- Content filtering (spamové fráze v textu)
- Nízká doménová reputace (nová doména)
- Chybí email warmup
  
**Řešení:**
- Testujte content na mail-tester.com
- Začněte posílat méně emailů (5-10 denně)
- Postupně zvyšujte volume

---

## 📞 DALŠÍ KROKY

1. **HNED:** Upravte DNS záznamy (SPF + DMARC)
2. **Po 15-30 min:** Spusťte diagnostický script
3. **Po ověření DNS:** Odešlete testovací email
4. **Zkontrolujte:** Gmail "Show original" + mail-tester.com
5. **V produkci:** Monitorujte doručitelnost prvních 50-100 emailů
6. **Po týdnu:** Zpřísněte DMARC na `p=quarantine`

---

## 📚 UŽITEČNÉ ODKAZY

- **Resend Dashboard:** https://resend.com/domains
- **Mail Tester:** https://www.mail-tester.com/
- **Google Postmaster Tools:** https://postmaster.google.com/
- **SPF Checker:** https://mxtoolbox.com/spf.aspx
- **DMARC Analyzer:** https://dmarc.org/

---

Vytvořeno: 2. února 2026  
Pro: Max & Jacob  
Status: **Ready for Implementation**
