# Email Fallback Implementation - Preaudit → Audit

## 🎯 Problém
**Root Cause:** Preaudit používal robustní `emailDetector.js` (4 metody včetně mailto links a /contact crawling), zatímco audit používal jen základní regex na text.

**Výsledek:** Email nalezený v preauditu se ztratil v auditu.

## ✅ Řešení
Implementován **spolehlivý fallback** z preaudit results do auditu.

### Změny

#### 1. **Nová funkce v `server/db.js`**
```javascript
getPreauditEmailByUrl(url, callback)
```
- Vyhledá email z preaudit_results podle URL (s normalizací)
- Podporuje varianty URL (s/bez www, s/bez trailing slash)
- Vrací email pouze pokud `has_email = 1` a email není prázdný

#### 2. **Fallback v `server/services/auditPipeline.js`**

**Pro Scraper V3 (řádky 2993-3023):**
```javascript
// Pokud žádný email nenalezen po všech standardních metodách:
if (emailByKey.size === 0 && job.input_url) {
  const preauditEmail = await getPreauditEmailByUrl(job.input_url);
  if (preauditEmail) {
    pushEmailCandidate(preauditEmail, 'preaudit_fallback');
  }
}
```

**Pro Scraper V2 (řádky 1340-1371):**
```javascript
// Pokud žádný email nenalezen:
if (!emailMatch && mergedContacts.emails.length === 0 && job.input_url) {
  const preauditEmail = await getPreauditEmailByUrl(job.input_url);
  if (preauditEmail) {
    emailMatch = [preauditEmail];
    mergedContacts.emails.push({ value: preauditEmail, source: 'preaudit_fallback' });
  }
}
```

## 📋 Priorita hledání emailu

### V Preauditu (emailDetector.js):
1. ✅ **Mailto links** - `a[href^="mailto:"]`
2. ✅ **DOM sekce** - footer, header, contact sections
3. ✅ **Full HTML regex** - celý HTML kód
4. ✅ **/contact page crawl** - aktivní navigace na kontaktní stránky

### V Auditu (auditPipeline.js):
1. ✅ **JSON-LD structured data** - `item.email`
2. ✅ **NAP extraction** - `homepage.nap_json.email`, `contactPage.nap_json.email`
3. ✅ **Text regex** - scan prvních 120k znaků
4. 🆕 **PREAUDIT FALLBACK** - pokud vše ostatní selhalo

## 🧪 Jak otestovat

### Test 1: Základní funkčnost
```bash
# 1. V preauditu najdi firmu s emailem
# URL: https://mainplumbingmiami.com/

# 2. Potvrď preaudit result (vytvoří audit)

# 3. V konzoli sleduj:
[AUDIT V3] No email found in scraped pages, checking preaudit fallback...
[DB] Found preaudit email fallback: { url: '...', email: 'xxx@yyy.com', title: '...' }
[AUDIT V3] ✓ Found email from preaudit fallback: xxx@yyy.com
```

### Test 2: Kontrola v databázi
```sql
-- Zkontroluj že email byl uložen v audit jobu
SELECT 
  id,
  input_url,
  status,
  json_extract(scrape_result_json, '$.email') as email,
  json_extract(scrape_result_json, '$.contacts.emails') as emails_array
FROM audit_jobs 
WHERE input_url = 'https://mainplumbingmiami.com/'
ORDER BY created_at DESC 
LIMIT 1;
```

### Test 3: Kontrola ve veřejném auditu
1. Otevři audit ve veřejném view
2. V sekci "Contact" zkontroluj že email je zobrazen
3. Source by měl být `preaudit_fallback`

## 🔒 Spolehlivost

### Bezpečnostní opatření:
- ✅ **URL normalizace** - funguje i při různých formátech URL
- ✅ **Async error handling** - chyby v fallbacku nezbourají celý audit
- ✅ **Logging** - každý krok je logován pro debugging
- ✅ **Neblokující** - pokud preaudit email neexistuje, audit pokračuje normálně
- ✅ **Kompatibilita** - funguje pro V2 i V3 scraper

### Edge cases:
- ✅ URL s/bez www → normalizace řeší
- ✅ URL s/bez trailing slash → normalizace řeší  
- ✅ Žádný preaudit result → gracefully vrátí null
- ✅ Preaudit bez emailu → není použit
- ✅ Více preaudit results → použije nejnovější

## 📊 Očekávané výsledky

Pro URL `https://mainplumbingmiami.com/`:
- **Preaudit:** ✅ Email nalezen (mailto link nebo DOM)
- **Audit (před):** ❌ Email nenalezen (chybí v prvních 4k znacích textu)
- **Audit (po):** ✅ Email nalezen přes fallback
- **Source:** `preaudit_fallback`

## 🚀 Deploy
Změny jsou hotové a připravené k otestování. Stačí:
1. Restartovat server
2. Spustit nový audit na URL, které má email v preauditu
3. Ověřit že fallback funguje

## 📝 Poznámky
- Fallback je **pasivní** - používá se jen když audit email nenajde
- Fallback **nenahrazuje** standardní metody - je poslední resort
- Email z preauditu je **důvěryhodný** - už prošel validací v emailDetector.js
