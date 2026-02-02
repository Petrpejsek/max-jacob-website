# 📧 Email Testing Guide

Po dokončení všech změn (DNS + code) je potřeba otestovat, že emaily skutečně fungují a nejdou do spamu.

---

## KROK 1: Ověřit DNS Záznamy

```bash
node scripts/check-email-dns.js
```

**Očekávaný výsledek:**
```
✅ Contains required include: _spf.resend.com
✅ Has hard fail mechanism (-all)
✅ DKIM record exists
✅ Policy: none (monitoring mode)
✅ All DNS records are properly configured! ✨
```

**Pokud vidíte ❌:**
- Počkejte 15-30 minut na DNS propagaci
- Zkontrolujte, že jste správně upravili DNS záznamy
- Spusťte script znovu

---

## KROK 2: Odeslat Testovací Email

### A. Z Admin Dashboardu

1. Přihlaste se do admin dashboardu: `http://localhost:3000/admin`
2. Najděte nějaký audit v seznamu
3. Klikněte "View" na auditu
4. Scroll dolů na sekci "Email Preview"
5. Zadejte **SVOU** emailovou adresu (Gmail nebo Outlook pro nejlepší test)
6. Klikněte "Send Test Email"

### B. Test Email Obsahuje:

**V HTML verzi:**
- ✅ Personalizovaný obsah (niche + city)
- ✅ Obrázek s absolutní URL
- ✅ Top 3 lead leaks
- ✅ 7-day plan
- ✅ CTA button (mailto:jacob@maxandjacob.com)
- ✅ Disclaimer
- ✅ **Unsubscribe link** (viditelný v patičce)
- ✅ Max & Jacob branding

**V Plain Text verzi:**
- ✅ Automaticky generovaná z HTML
- ✅ Čitelný formát
- ✅ Všechny linky jako text + URL

**V Email Headers:**
- ✅ `From: Jacob from Max & Jacob <jacob@maxandjacob.com>`
- ✅ `Reply-To: jacob@maxandjacob.com`
- ✅ `List-Unsubscribe: <https://maxandjacob.com/unsubscribe?email=...>`
- ✅ `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

---

## KROK 3: Zkontrolovat Doručení

### Gmail Test

1. **Zkontrolujte složku Inbox**
   - Email **NEMĚL** být ve spamu
   - Pokud je ve spamu → čekejte na Krok 4

2. **Otevřete email**
   - Měl by vypadat profesionálně
   - Obrázky by se měly načíst
   - Unsubscribe link by měl být viditelný v patičce

3. **Show Original** (KRITICKÉ!)
   - Klikněte na tři tečky (⋮) vpravo nahoře
   - Vyberte "Show original"
   - Najděte tyto řádky:

   ```
   SPF: PASS
   DKIM: PASS
   DMARC: PASS
   ```

   **Všechny tři MUSÍ být PASS!**

4. **Zkontrolujte One-Click Unsubscribe**
   - V Gmailu by se měl zobrazit "Unsubscribe" button vedle jména odesílatele
   - To je díky `List-Unsubscribe` hlavičce

### Outlook/Hotmail Test

1. **Zkontrolujte Inbox**
   - Email by neměl být v Junk

2. **View Message Details**
   - Pravý klik na email → View message details
   - Zkontrolujte SPF/DKIM/DMARC headers

### Yahoo Test (volitelné)

Yahoo je nejpřísnější na spam filtering, takže je to dobrý test.

---

## KROK 4: Mail-Tester.com (Doporučeno!)

Toto je **nejlepší způsob** jak otestovat email deliverability.

1. Jděte na: **https://www.mail-tester.com/**

2. Zkopírujte emailovou adresu, kterou vám dají (např. `test-abc123@mail-tester.com`)

3. V admin dashboardu pošlete testovací email na tuto adresu

4. Vraťte se na mail-tester.com a klikněte "Then check your score"

5. **Očekávané skóre: 8/10 nebo vyšší** ✨

### Co kontroluje Mail-Tester:

- ✅ SPF record (PASS)
- ✅ DKIM signature (PASS)
- ✅ DMARC policy (PASS)
- ✅ Blacklist check (not blacklisted)
- ✅ Content analysis (no spam words)
- ✅ HTML quality
- ✅ Plain text alternative (máme!)
- ✅ Unsubscribe link (máme!)
- ✅ Image URLs (absolutní)
- ✅ Email authentication

### Možné Problémy:

**Skóre 6-7/10:**
- ⚠️ Pravděpodobně ještě propaguje DNS (počkejte 30 min)
- ⚠️ Nebo content problém (spam words)

**Skóre 4-5/10:**
- ❌ SPF/DKIM/DMARC fail → zkontrolujte DNS
- ❌ Blacklist → nová IP adresa, časem se vyřeší

**Skóre 9-10/10:**
- ✅ Perfektní! Gratuluji! 🎉

---

## KROK 5: Produkční Test

Po úspěšném testování:

1. **Pošlete 5-10 testovacích emailů** reálným příjemcům
   - Ideálně na různé providery (Gmail, Outlook, Yahoo)
   - Sledujte, jestli všechny dorazí do Inboxu

2. **Monitorujte první den**
   - Zkontrolujte email logy v admin dashboardu
   - Sledujte Resend dashboard pro delivery rate

3. **Postupně zvyšujte objem**
   - Den 1: 5-10 emailů
   - Den 2-3: 20-30 emailů
   - Den 4-7: 50+ emailů
   - To je "email warmup" pro novou doménu

---

## KROK 6: Dlouhodobé Monitorování

### Resend Dashboard
```
https://resend.com/emails
```
- Sledujte delivery rate (mělo by být >95%)
- Sledujte bounce rate (mělo by být <5%)
- Sledujte complaint rate (mělo by být <0.1%)

### Google Postmaster Tools (volitelné, ale doporučeno)
```
https://postmaster.google.com/
```
1. Přidejte `maxandjacob.com`
2. Ověřte doménu (přes DNS TXT record)
3. Sledujte:
   - Domain reputation (mělo být "High")
   - Spam rate (mělo být <0.1%)
   - Authentication rate (mělo být 100%)

### DMARC Reporty

Pokud jste nastavili `rua=mailto:postmaster@maxandjacob.com` v DMARC:
- Začnete dostávat denní XML reporty
- Ty ukazují, kolik emailů prošlo/neprošlo SPF/DKIM
- Můžete použít služby jako dmarcian.com nebo postmarkapp.com/dmarc pro analýzu

---

## 🚨 TROUBLESHOOTING

### Problém: Stále ve spamu i po všech změnách

**Možné příčiny:**

1. **DNS ještě nepropagovala** (počkejte 2 hodiny)
   ```bash
   node scripts/check-email-dns.js
   ```

2. **Content filtering** (spamová slova)
   - Test na mail-tester.com ukáže konkrétní problémy
   - Vyhněte se slovům: "free", "guaranteed", "100%", "cash", "money back"

3. **Nová doména/IP má nízkou reputaci**
   - Řešení: Email warmup (postupné zvyšování volumenu)
   - Trvá 1-2 týdny než se reputace zlepší

4. **Špatný engagement** (nízká míra otevření)
   - Posílejte jen relevantním příjemcům
   - Subject line by měl být zajímavý, ne spamový

5. **Blacklist**
   - Zkontrolujte na: https://mxtoolbox.com/blacklists.aspx
   - Pokud jste na blacklistu, požádejte o removal

### Problém: SPF/DKIM/DMARC = PASS, ale stále spam

Tohle je obvykle **content problem** nebo **reputation problem**:

**A. Content Check:**
```
- Zkontrolujte na mail-tester.com
- Odstraňte spam phrases
- Přidejte víc text, méně obrázků (ratio 60:40)
- Zajistěte, že unsubscribe link je viditelný
```

**B. Reputation Building:**
```
- Začněte s malým počtem emailů (5-10/den)
- Postupně zvyšujte
- Posílejte jen lidem, kteří mají zájem (vyšší open rate)
- Nikdy nekupujte email listy!
```

### Problém: Obrázky se nenačítají

- ✅ Zkontrolujte, že používáte **absolutní URL** (`https://maxandjacob.com/...`)
- ✅ Zkontrolujte, že obrázky existují na serveru
- ✅ Zkontrolujte, že obrázky nemají broken links

---

## ✅ CHECKLIST

Před odesláním produkčních emailů:

**DNS:**
- [ ] SPF obsahuje `include:_spf.resend.com`
- [ ] DKIM je verified v Resend dashboardu
- [ ] DMARC existuje (jeden záznam, ne duplicity)
- [ ] `node scripts/check-email-dns.js` všechno ✅

**Code:**
- [ ] `From: Jacob from Max & Jacob <jacob@maxandjacob.com>`
- [ ] `Reply-To: jacob@maxandjacob.com`
- [ ] `List-Unsubscribe` hlavička
- [ ] Unsubscribe link v HTML patičce
- [ ] Plain text verze emailu
- [ ] Absolutní URL pro obrázky

**Testing:**
- [ ] Testovací email dorazil do Inboxu (ne spam)
- [ ] Gmail "Show original" → SPF/DKIM/DMARC = PASS
- [ ] Mail-tester.com skóre 8+/10
- [ ] Obrázky se načítají správně
- [ ] Unsubscribe link funguje
- [ ] One-click unsubscribe button v Gmailu

**Produkce:**
- [ ] První den: 5-10 emailů
- [ ] Všechny dorazily do Inboxu
- [ ] Resend dashboard: delivery rate >95%
- [ ] Po týdnu: změnit DMARC na `p=quarantine`

---

## 📚 UŽITEČNÉ ODKAZY

- **Resend Dashboard:** https://resend.com/
- **Mail Tester:** https://www.mail-tester.com/
- **MX Toolbox:** https://mxtoolbox.com/
- **Google Postmaster:** https://postmaster.google.com/
- **DMARC Analyzer:** https://dmarc.org/
- **SPF Record Check:** https://mxtoolbox.com/spf.aspx
- **Blacklist Check:** https://mxtoolbox.com/blacklists.aspx

---

Vytvořeno: 2. února 2026  
Pro: Max & Jacob  
Status: **Ready for Testing**
