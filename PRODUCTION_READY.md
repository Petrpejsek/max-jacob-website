# Production Ready - maxandjacob.com

## ✅ Kompletní produkční hardening dokončen

### Co bylo uděláno:

#### 1. Zabezpečení secrets (P0)
- ❌ Odstraněno hardcoded `ADMIN_PASSWORD` z `render.yaml`
- ✅ Secrets nyní načítané přes ENV variables
- ✅ Přidán `OPENROUTER_API_KEY` do ENV requirements

#### 2. Zabezpečení souborů (P0)
- ✅ Static file serving přepsáno na whitelist přípon
- ✅ Blacklist citlivých cest: `data.db`, `.env`, `server/`, `.git/`, node_modules
- ✅ Pouze `/public` adresář je dostupný přes web
- ✅ Security headers (Helmet) přidány

#### 3. Persistence & Storage (P1)
- ✅ Vytvořen `server/runtimePaths.js` pro centrální path management
- ✅ DB path nyní: `process.env.DB_PATH` nebo fallback do `/opt/render/project/data/data.db`
- ✅ Public dir nyní: `process.env.PUBLIC_DIR` nebo fallback do `/opt/render/project/data/public`
- ✅ Všechny soubory přepsány na používání runtime paths
- ✅ `.gitignore` aktualizován (data.db-wal, data.db-shm)

#### 4. Databáze (P1)
- ✅ SQLite pragmata pro produkci: `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`
- ✅ Přidána chybějící tabulka `site_settings` (pro team photos)
- ✅ WAL mode zachován

#### 5. Audit Pipeline Queue (P2)
- ✅ Vytvořen `server/services/auditQueue.js`
- ✅ Concurrency limit: 1 job současně (Playwright + LLM je těžký)
- ✅ Admin routes integrují queue (nevytvoří 10 auditů paralelně)

#### 6. Security Middleware (P3)
- ✅ Rate-limit na `/admin/login`: max 5 pokusů za 15 minut
- ✅ Rate-limit na audit jobs: max 3 za minutu
- ✅ Helmet security headers (CSP, HSTS, frameguard, noSniff)
- ✅ SESSION_SECRET validace při startu (v produkci musí být nastaveno)
- ✅ Secure cookies: `httpOnly`, `secure` (production), `sameSite`

#### 7. Monitoring & Backup (P4)
- ✅ `/health` endpoint rozšířen o DB test + disk write test
- ✅ Backup script: `scripts/backup-db.sh` (denní DB + assets, 30 dní retence)
- ✅ Backup do `/opt/render/project/backups` nebo custom `BACKUP_DIR`

---

## 🚀 Deploy na Render (Production Checklist)

### 1. Přidat Persistent Disk na Renderu

Dashboard → Your Service → Disks → Add Disk:
- **Name**: `data`
- **Mount Path**: `/opt/render/project/data`
- **Size**: 10GB (stačí na začátek, později zvýšit dle potřeby)

### 2. Nastavit Environment Variables

Dashboard → Your Service → Environment:

```bash
NODE_ENV=production
ADMIN_PASSWORD=<STRONG_NEW_PASSWORD>  # ZMĚŇ! Staré heslo bylo v gitu!
SESSION_SECRET=<64_RANDOM_CHARS>      # openssl rand -hex 32
OPENROUTER_API_KEY=<YOUR_KEY>
DB_PATH=/opt/render/project/data/data.db
PUBLIC_DIR=/opt/render/project/data/public
```

**Generovat SESSION_SECRET:**
```bash
openssl rand -hex 32
```

### 3. Install Dependencies

```bash
npm install
```

Nové dependencies:
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting

### 4. Deploy

```bash
git add .
git commit -m "Production hardening: secrets, persistence, queue, security"
git push origin main
```

Render automaticky deployuje (autoDeploy: true v render.yaml).

### 5. Nastavit Backup Cron (na Renderu)

Render Dashboard → Cron Jobs → Add Cron Job:
- **Command**: `bash scripts/backup-db.sh`
- **Schedule**: `0 2 * * *` (každý den v 2:00)

Nebo pokud Render nepodporuje cron, použij externí službu (GitHub Actions / Render background worker).

---

## 📊 Ověření Production Readiness

### Test 1: Health Check
```bash
curl https://maxandjacob.com/health
```
Očekávaný výstup:
```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "disk": "ok"
  }
}
```

### Test 2: Static Files Security
```bash
# Tyto URL NESMÍ fungovat:
curl https://maxandjacob.com/data.db          # → 403 Forbidden
curl https://maxandjacob.com/.env             # → 403 Forbidden
curl https://maxandjacob.com/server/db.js     # → 403 Forbidden

# Tyto URL MUSÍ fungovat:
curl https://maxandjacob.com/index.html       # → 200 OK
curl https://maxandjacob.com/style.css        # → 200 OK
curl https://maxandjacob.com/public/team/jacob.jpg  # → 200 OK
```

### Test 3: Admin Login Rate Limit
```bash
# 6. pokus by měl být odmítnut
for i in {1..6}; do
  curl -X POST https://maxandjacob.com/admin/login \
    -d "password=wrong" \
    -H "Content-Type: application/x-www-form-urlencoded"
done
```

### Test 4: Queue Status
Otevři admin panel → vytvořit 3 audity rychle po sobě.
Měly by běžet sekvenčně (ne paralelně).

---

## 🔧 Runtime Path Configuration

Systém automaticky detekuje správné cesty:

**Development (lokálně):**
- DB: `/Users/petrliesner/Max&Jacob/data.db`
- Public: `/Users/petrliesner/Max&Jacob/public`

**Production (Render s persistent disk):**
- DB: `/opt/render/project/data/data.db`
- Public: `/opt/render/project/data/public`

**Custom paths (override přes ENV):**
```bash
export DB_PATH=/custom/path/data.db
export PUBLIC_DIR=/custom/path/public
```

---

## 📈 Škálování (budoucnost)

**Kdy migrovat na Postgres + S3:**
- Více než 1 server instance
- >100 auditů/den
- Potřeba paralelních jobů (>2)

**Migrace:**
1. Export SQLite → Postgres: `sqlite3 data.db .dump | psql`
2. Přidat `pg` package, vytvořit `server/db-postgres.js`
3. Přepnout env `DATABASE_TYPE=postgres`
4. Assets přes S3/R2: upravit upload paths v `runtimePaths.js`

---

## 🐛 Troubleshooting

### Server neběží po deploy
1. Zkontroluj Render logs: Dashboard → Service → Logs
2. Ověř že persistent disk je připojený: `ls -la /opt/render/project/data`
3. Ověř ENV vars: SESSION_SECRET, ADMIN_PASSWORD, OPENROUTER_API_KEY

### Database locked error
- SQLite nyní má `busy_timeout=5000` → mělo by pomoct
- Pokud přetrvává: snížit concurrency v `auditQueue.js` na 1 (už je)

### Playwright fails v produkci
Render build musí mít chromium:
```yaml
buildCommand: npm install && npx playwright install --with-deps chromium
```
(už je v render.yaml)

### Rate limit blokuje legitimní požadavky
Upravit limity v `server/middleware/security.js`:
- `loginLimiter.max` - zvýšit z 5 na 10
- `auditJobLimiter.max` - zvýšit z 3 na 5

---

## 📞 Support

Jakékoliv problémy:
1. Zkontroluj Render logs
2. Ověř `/health` endpoint
3. Zkontroluj git status: `git status`
4. Review změny: `git diff`
