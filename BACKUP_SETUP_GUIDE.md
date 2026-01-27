# Automated Backup Setup Guide

## 🎯 Cíl: Nikdy neztratit data

Tento guide nastaví **3 úrovně ochrany**:
1. **Local backups** na Render disku (30 dní)
2. **GitHub Actions** backups (30 dní)
3. **Manual backups** kdykoliv potřebujete

---

## 📋 Metoda 1: Render Cron Job (NEJJEDNODUŠŠÍ)

### Krok 1: Zkontrolujte Render plán
Render Cron Jobs jsou dostupné na **Standard plánu a vyšším**.

**Zkontrolujte:** Dashboard → Billing → Current Plan

- ✅ Pokud máte Standard+: Pokračujte krokem 2
- ❌ Pokud máte Starter: Použijte Metodu 2 (GitHub Actions)

### Krok 2: Vytvořte Cron Job na Renderu

1. **Jděte na Render Dashboard:**
   - https://dashboard.render.com
   - Vyberte workspace

2. **Přidejte Cron Job:**
   - Click "New +" → "Cron Job"
   
3. **Konfigurace:**
   ```
   Name:          database-backup
   Environment:   Same as web service (production)
   Command:       bash /opt/render/project/src/scripts/backup-db.sh
   Schedule:      0 2 * * *  (každý den v 2:00 UTC)
   ```

4. **Environment Variables (DŮLEŽITÉ!):**
   ```bash
   DB_PATH=/opt/render/project/data/data.db
   PUBLIC_DIR=/opt/render/project/data/public
   BACKUP_DIR=/opt/render/project/data/backups
   ```

5. **Přidejte přístup k disku:**
   - V Cron Job nastavení → Storage
   - Připojte stejný disk jako web service: `data`
   - Mount path: `/opt/render/project/data`

6. **Klikněte "Create Cron Job"**

### Krok 3: Test
```bash
# V Render Dashboard → Cron Job → Trigger manually
# Nebo počkejte do zítřka 2:00 UTC
```

---

## 📋 Metoda 2: GitHub Actions (ZDARMA, ale složitější)

### Výhody:
- ✅ Funguje na Starter plánu
- ✅ Zálohy uložené na GitHubu (mimo Render)
- ✅ 30 dní retention
- ✅ Lze stáhnout kdykoliv

### Nevýhody:
- ❌ Potřebuje SSH přístup k Render serveru
- ❌ Složitější setup

### Krok 1: Vygenerujte SSH klíč pro GitHub Actions

**Na vašem počítači:**
```bash
ssh-keygen -t ed25519 -C "github-actions-backup" -f ~/.ssh/render_backup_key
# Nezadávejte passphrase (stiskněte Enter 2x)
```

### Krok 2: Přidejte SSH klíč na Render

1. **Zobrazte veřejný klíč:**
   ```bash
   cat ~/.ssh/render_backup_key.pub
   ```

2. **Render Dashboard:**
   - Settings → Environment
   - Scroll dolů → SSH Public Keys
   - Klikněte "Add Key"
   - Paste klíč
   - Klikněte "Save"

### Krok 3: Přidejte secrets na GitHub

1. **Zobrazte privátní klíč:**
   ```bash
   cat ~/.ssh/render_backup_key
   ```

2. **GitHub:**
   - Repository → Settings → Secrets and variables → Actions
   - Klikněte "New repository secret"
   
3. **Přidejte tyto secrets:**
   ```
   RENDER_SSH_KEY:  (obsah ~/.ssh/render_backup_key)
   RENDER_HOST:     max-jacob-website-10000.onrender.com
   RENDER_USER:     render
   ```

### Krok 4: Workflow je už vytvořený!

Soubor `.github/workflows/backup-database.yml` už existuje v repozitáři.

### Krok 5: Push na GitHub
```bash
git add .github/workflows/backup-database.yml
git commit -m "Add automated database backups via GitHub Actions"
git push origin main
```

### Krok 6: Test
GitHub Actions → Workflows → "Daily Database Backup" → "Run workflow"

---

## 📋 Metoda 3: Manual Backup (kdykoliv)

### Z Render Shell:
```bash
# 1. Jděte na Render Dashboard → Shell
# 2. Spusťte:
bash /opt/render/project/src/scripts/backup-db.sh
```

### Nebo přes SSH:
```bash
ssh render@max-jacob-website-10000.onrender.com
bash /opt/render/project/src/scripts/backup-db.sh
```

### Stažení zálohy:
```bash
# Z Render Shell:
cd /opt/render/project/data/backups
ls -lh

# Download přes Render Dashboard:
# Shell → cat data-2026-01-27.db.gz | base64
# Zkopírujte output a decode lokálně:
# echo "BASE64_HERE" | base64 -d > backup.db.gz
```

---

## 🔍 Ověření, že backupy fungují

### Zkontrolujte backup adresář na Renderu:
```bash
# Render Shell
ls -lh /opt/render/project/data/backups/
```

Měli byste vidět:
```
data-2026-01-27_02-00-00.db.gz
assets-2026-01-27_02-00-00.tar.gz
data-2026-01-26_02-00-00.db.gz
...
```

### Zkontrolujte GitHub Actions (pokud používáte):
- Repository → Actions → "Daily Database Backup"
- Měl by být zelený checkmark ✅
- Klikněte na run → Artifacts → Měl by tam být backup

---

## 🔄 Restore ze zálohy

### Postup:
```bash
# 1. Stáhněte zálohu
scp render@max-jacob-website-10000.onrender.com:/opt/render/project/data/backups/data-2026-01-27.db.gz .

# 2. Rozbalte
gunzip data-2026-01-27.db.gz

# 3. Na Render serveru:
# POZOR: Toto přepíše současnou databázi!
mv /opt/render/project/data/data.db /opt/render/project/data/data.db.old
cp data-2026-01-27.db /opt/render/project/data/data.db

# 4. Restartujte server
# Render Dashboard → Manual Deploy → Deploy latest commit
```

---

## 📊 Monitoring

### Jak často kontrolovat:
- **Týdně:** Zkontrolujte, že backupy běží (Render Logs nebo GitHub Actions)
- **Měsíčně:** Test restore (vyzkoušejte obnovit zálohu do test databáze)

### Alerting (volitelné):
Přidejte notifikace v GitHub Actions workflow:
```yaml
- name: Notify on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## ✅ Checklist

Po dokončení byste měli mít:
- [ ] Render Cron Job běží denně v 2:00 UTC
- [ ] Nebo GitHub Actions běží denně v 2:00 UTC
- [ ] Backupy jsou viditelné v `/opt/render/project/data/backups/`
- [ ] Test backup byl úspěšný
- [ ] Víte, jak obnovit ze zálohy

---

## 🚨 Emergency Restore

Pokud ztratíte data TEĎKA:
```bash
# 1. Jděte na GitHub → Actions → Daily Database Backup
# 2. Klikněte na poslední úspěšný run
# 3. Download artifact "database-backup-XXX"
# 4. Rozbalte a nahrajte na Render (viz Restore sekce výše)
```

---

## 📞 Support

Jakékoliv problémy s backupy:
1. Zkontrolujte Render Logs
2. Zkontrolujte GitHub Actions Logs
3. Test manual backup: `bash scripts/backup-db.sh`
