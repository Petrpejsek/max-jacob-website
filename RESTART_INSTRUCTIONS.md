# ⚠️ RESTART REQUIRED - City Detection Fix

## Co bylo opraveno:
✅ String address parsing - města jako "Fort Lauderdale" se nyní extrahují z address jako `"..., Fort Lauderdale, FL, ..."`
✅ Amy's Plumbing case - audit ukáže "Fort Lauderdale" místo "Miami"

---

## 🔴 CRITICAL: Server MUSÍ být restartován!

Změny v `scraperV3.js` se projeví jen po restartu Node procesu.

---

## Restart Instrukce

### Metoda 1: Terminal (doporučeno)

```bash
# 1. Najdi běžící proces
ps aux | grep node

# Měl by zobrazit:
# petrliesner  64677  ... node server/server.js

# 2. Kill proces
kill 64677

# 3. Restart dev server
cd "/Users/petrliesner/Max&Jacob"
npm run dev
```

### Metoda 2: Dev script (pokud máš)

```bash
# Pokud máš dev.sh script:
./dev.sh restart
```

### Metoda 3: Manual restart

```bash
# V terminálu kde běží server:
Ctrl+C   (stop server)

# Pak:
npm run dev
```

---

## ✅ Verification Checklist

Po restartu ověř:

### 1. Server běží
```
Navigate to: http://localhost:3000
Expected: homepage loads ✅
```

### 2. Admin panel přístupný
```
Navigate to: http://localhost:3000/admin/login
Expected: login page ✅
```

### 3. Vytvoř NOVÝ audit
```
1. Go to: /admin/audits/new
2. URL: https://amysplumbing.com/
3. Niche: plumbing
4. City: (leave EMPTY!)
5. Click "Run Audit"
```

### 4. Sleduj logy
```
Expected logs:
✓ Detected city from NAP data: Fort Lauderdale

NOT:
✗ Detected city from page text: Miami
✗ No city detected - using generic location
```

### 5. Ověř veřejný audit
```
Navigate to: /audit/{audit_id}

Expected v headline:
"You're Invisible to Fort Lauderdale Customers Everywhere."

NOT:
"You're Invisible to Miami Customers Everywhere." ❌
```

---

## 🐛 Troubleshooting

### Issue: Stále vidím "Miami"

**Možné příčiny:**

1. **Server nebyl restartován**
   ```bash
   # Force kill a restart:
   pkill -f "node.*server.js"
   npm run dev
   ```

2. **Testuješ STARÝ audit**
   - Audity vytvořené PŘED fixem mají `city = "Miami"` v databázi
   - Vytvoř NOVÝ audit pro test

3. **Cache problém**
   ```bash
   # Clear npm cache:
   rm -rf node_modules/.cache
   
   # Hard refresh browser:
   Cmd+Shift+R (Mac) nebo Ctrl+Shift+R (Windows)
   ```

### Issue: Město je stále NULL

**Debug steps:**

1. **Zkontroluj scrape preview:**
   ```
   Admin panel → Audit detail → "Scrape Preview" tab
   
   Měl by zobrazit:
   ADDRESS: 1150 SW 27th Ave, Fort Lauderdale, FL, 33312
   CITY: Fort Lauderdale ✅
   ```

2. **Zkontroluj JSON-LD na webu:**
   ```javascript
   // V browser console na amysplumbing.com:
   Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
     .map(s => JSON.parse(s.textContent))
   
   // Hledej: address field
   // Pokud je STRING → regex by ho měl vytáhnout
   // Pokud je OBJECT → addressLocality by mělo existovat
   ```

3. **Zkontroluj logs v databázi:**
   ```sql
   SELECT id, city, logs_json 
   FROM audit_jobs 
   WHERE id = {your_audit_id};
   
   -- logs_json by mělo obsahovat:
   -- "✓ Detected city from NAP data: Fort Lauderdale"
   ```

### Issue: Regex selhává

**Otestuj regex manuálně:**

```javascript
// V Node REPL nebo browser console:
const address = "1150 SW 27th Ave, Fort Lauderdale, FL, 33312";
const cityMatch = address.match(/,\s*([A-Za-z\s]+),\s*[A-Z]{2}/);

console.log(cityMatch);
// Expected: ["Fort Lauderdale", ...]

console.log(cityMatch[1].trim());
// Expected: "Fort Lauderdale"
```

---

## 📊 Expected Behavior Summary

| Scenario | Before Fix | After Fix |
|----------|-----------|-----------|
| Amy's Plumbing (string address) | city = null → "Miami" ❌ | city = "Fort Lauderdale" ✅ |
| Empire Plumbing (object address) | city = "San Francisco" ✅ | city = "San Francisco" ✅ |
| No address at all | city = "Miami" ❌ | city = "your area" ⚠️ |
| Cities in text only | city = "Miami" or first found | city = first found ✅ |

---

## 🎯 Quick Test URLs

### Test 1: Amy's Plumbing (string address)
```
URL: https://amysplumbing.com/
Expected city: Fort Lauderdale
Source: String address parsing
```

### Test 2: Empire Plumbing (object address)
```
URL: https://empireplumbing.com/
Expected city: San Francisco
Source: addressLocality object
```

### Test 3: WM Plumbing (multi-location)
```
URL: https://wmplumbinginc.com/
Expected city: (first detected from NAP or text)
Source: NAP or cities_json
```

---

## 📝 Checklist před Production

- [ ] Server restartován
- [ ] Nový audit vytvořen s Amy's Plumbing
- [ ] Log zobrazuje: `✓ Detected city from NAP data: Fort Lauderdale`
- [ ] Veřejný audit zobrazuje: "Fort Lauderdale Customers"
- [ ] Test s dalšími URL (Empire, WM Plumbing)
- [ ] Žádné error logy v console
- [ ] Database má správné `city` hodnoty

---

## 🚀 Production Deployment

```bash
# 1. Commit changes
git add server/services/scraperV3.js
git commit -m "fix: extract city from string addresses in NAP data"

# 2. Push to production
git push origin main

# 3. Restart production server
# (závisí na hosting platform - Render, Heroku, etc.)
```

---

## 📞 Support

Pokud problém přetrvává:

1. Zkontroluj `FIX_STRING_ADDRESS_PARSING.md` - kompletní technická dokumentace
2. Review `CITY_DETECTION_FLOW.md` - flow diagram
3. Spusť test: `npm test` (pokud je nakonfigurován)
4. Check server logs: `tail -f logs/server.log` (pokud existuje)
