# Diagnostika problému s Render deployment

## KROKY PRO DIAGNOSTIKU:

### 1. Zkontrolujte Render Dashboard - Logs
Otevřete Render Dashboard → Vaše služba → Logs tab

**Co hledat:**
- Vidíte `=== SERVER STARTING ===`?
- Vidíte `=== SERVER STARTED ===`?
- Vidíte nějaké chybové hlášky při startu?

### 2. Test endpointy v prohlížeči

Zkuste otevřít v prohlížeči:

1. **https://maxandjacob.com/diagnostic**
   - Mělo by zobrazit JSON s detaily serveru
   - Pokud vidíte "Cannot GET /diagnostic" = Express server neběží nebo static files middleware ho přepisuje

2. **https://maxandjacob.com/health**
   - Mělo by zobrazit JSON: `{"status":"ok",...}`
   - Pokud vidíte "Cannot GET /health" = stejný problém

3. **https://maxandjacob.com/api/test-direct**
   - Mělo by zobrazit JSON
   - Pokud vidíte "Cannot GET /api/test-direct" = API routes nefungují

### 3. Zkontrolujte Render Dashboard - Settings

**DŮLEŽITÉ:** Zkontrolujte, jestli je vaše služba nastavená jako:
- ✅ **Web Service** (Node.js server)
- ❌ **Static Site** (pouze static files - TOHLE JE ŠPATNĚ!)

Pokud je to Static Site, API routes nikdy nebudou fungovat!

### 4. Zkontrolujte Network tab v Developer Tools

1. Otevřete https://maxandjacob.com/web-project-form.html
2. Otevřete Developer Tools (F12) → Network tab
3. Vyplňte a odešlete formulář
4. Podívejte se na request na `/api/web-project-submissions`:
   - Jaký je **Status Code**? (200, 404, 500?)
   - Jaký je **Response**?

### 5. Zkontrolujte Render Environment Variables

Render Dashboard → Vaše služba → Environment tab

**Ujistěte se, že máte:**
- `NODE_ENV=production` (nastaveno v render.yaml)
- `PORT` - NENASTAVOVAT! Render ho nastaví automaticky
- `SESSION_SECRET` - nastavit na nějakou náhodnou hodnotu
- `ADMIN_PASSWORD` - nastavit heslo pro admin

### 6. Možné příčiny problému:

1. **Static Site místo Web Service**
   - Render servuje pouze static files
   - Express server se nespouští
   - Řešení: Změnit typ služby na Web Service

2. **Render reverse proxy/CDN servuje static files přímo**
   - Requesty na API routes se nedostanou k Express serveru
   - Řešení: Kontaktovat Render support

3. **Build nebo start command nefunguje**
   - Server se nespustí správně
   - Řešení: Zkontrolovat logy při startu

4. **Environment variables chybí**
   - Server se nespustí kvůli chybějícím proměnným
   - Řešení: Zkontrolovat všechny potřebné ENV vars

---

**POŠLETE MI:**
1. Co vidíte v Render logách při startu serveru?
2. Co vidíte když otevřete https://maxandjacob.com/diagnostic?
3. Je služba nastavená jako "Web Service" nebo "Static Site"?
4. Co vidíte v Network tabu při odesílání formuláře?

