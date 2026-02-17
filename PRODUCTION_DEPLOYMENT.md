# Production Deployment Checklist ✅

## ✅ Completed Steps

### 1. Code Preparation
- ✅ All local implementations committed
- ✅ SQLite runtime files excluded from git (.gitignore updated)
- ✅ Development files removed (.dev.pid)
- ✅ Database migrations are safe (CREATE TABLE IF NOT EXISTS)
- ✅ No hard deletes - all data preserved via status updates
- ✅ Code pushed to GitHub (main branch)

### 2. Database Safety
- ✅ All new tables use `CREATE TABLE IF NOT EXISTS`
- ✅ No existing data will be deleted
- ✅ Status-based filtering (no DROP or DELETE commands)
- ✅ Foreign keys use ON DELETE CASCADE only for preaudit data

## 🚀 Production Deployment Steps

### Step 1: Set Environment Variables on Render.com

Go to your Render dashboard → Your service → Environment → Add the following:

**Required for Preaudits:**
```
Key: SERPER_API_KEY
Value: [Get from https://serper.dev - FREE 2,500 searches/month]
```

**Optional (already in render.yaml):**
```
Key: ENABLE_PREAUDIT_FULLPAGE_SCREENSHOTS
Value: true
```

### Step 2: Verify Existing Environment Variables

Make sure these are still set (don't change them):
- ✅ `ADMIN_PASSWORD` - Your admin password
- ✅ `SESSION_SECRET` - Session security key
- ✅ `RESEND_API_KEY` - Email service (if using)
- ✅ `DB_PATH` - Path to SQLite database
- ✅ `PUBLIC_DIR` - Path to public/persistent storage

**For Deal Threads (magic-link client chat):**
- ✅ `BASE_URL` - Your production app URL (e.g. `https://max-jacob-website.onrender.com` or custom domain). Used in magic-link emails and "View conversation" links. If unset, the app uses the request host (works behind a single domain).

### Step 3: Deploy on Render

**Option A: Automatic Deploy (if enabled)**
- Render will automatically detect the push and start deploying
- Monitor the deploy logs in Render dashboard
- Wait for "Deploy successful" message

**Option B: Manual Deploy**
1. Go to Render dashboard
2. Click on your service
3. Click "Manual Deploy" → "Deploy latest commit"
4. Monitor the logs

### Step 4: Verify Deployment

After deployment completes:

1. **Check Service Health:**
   - Open your production URL
   - Verify the site loads correctly
   - Check browser console for errors

2. **Test Database Migration:**
   - Login to admin panel: `/admin`
   - Navigate to Audit Jobs: `/admin/audits`
   - Verify existing audits are still visible ✅
   - Look for "Preaudits" link in navigation

3. **Test Preaudits System:**
   - Navigate to: `/admin/preaudits`
   - Try a small test search (3-5 results)
   - Verify search completes successfully
   - Check GREEN/RED results display correctly

4. **Verify Screenshots:**
   - Check if screenshots are saved to persistent storage
   - Path should be: `PUBLIC_DIR/preaudit_screenshots/`
   - Verify screenshots load in UI

5. **Test Deal Threads (client chat):**
   - In admin go to: **Deal Threads** (or `/admin/deals`)
   - Create a new deal (title, client name, email) → client receives magic-link email if `RESEND_API_KEY` is set
   - Open the deal thread, copy **Client Link**, open it in an incognito window — you should see the client chat (no sidebar)
   - Send a message as client; you should get an email at jacob@maxandjacob.com (if Resend is configured)
   - Reply from admin; client should get an email with "View conversation" pointing to production URL
   - **BASE_URL:** If magic links in emails point to localhost or wrong domain, set `BASE_URL` in Render to your production URL (e.g. `https://max-jacob-website.onrender.com`)

## 📋 Post-Deployment Verification

### Database Tables Created
Run this in your Render shell (if needed):
```bash
sqlite3 /path/to/data.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

You should see:
- ✅ `preaudit_searches`
- ✅ `preaudit_results`
- ✅ `preaudit_blacklist`
- ✅ `deals`, `deal_messages`, `deal_attachments` (deal threads)
- ✅ All existing tables (audit_jobs, etc.)

### Logs to Monitor
```bash
# On Render dashboard, check logs for:
[SERVER] Starting server...
[DB] Database initialized
[DB] Table preaudit_searches ready
[DB] Table preaudit_results ready
[DB] Table preaudit_blacklist ready
```

## 🔧 Troubleshooting

### Issue: "SERPER_API_KEY not configured"
**Solution:** Add the environment variable in Render dashboard and redeploy

### Issue: Screenshots not saving
**Solution:** 
- Verify `PUBLIC_DIR` environment variable is set
- Check Render persistent disk is mounted correctly
- Path should be: `/opt/render/project/data/public`

### Issue: Database migration errors
**Solution:** 
- Check Render logs for specific error
- All migrations use `CREATE TABLE IF NOT EXISTS` - safe to rerun
- Existing data is preserved

### Issue: Deal thread magic links point to wrong URL in emails
**Solution:** Set `BASE_URL` in Render dashboard to your production URL (e.g. `https://max-jacob-website.onrender.com` or your custom domain). Redeploy not required; restart is enough.

### Issue: Search fails
**Solution:**
- Verify SERPER_API_KEY is valid (check serper.dev dashboard)
- Check API usage limits (2,500 free searches/month)
- Look for specific error in Render logs

## 📊 System Requirements

### Render.com Settings (Verify these are correct)
- **Environment:** Node.js
- **Build Command:** `npm install`
- **Start Command:** `npm start` or `node server/index.js`
- **Persistent Disk:** Mounted at `/opt/render/project/data`

### Database
- **Type:** SQLite
- **Location:** `/opt/render/project/data/data.db`
- **Backup:** Use `/admin/backup` endpoint regularly

### Storage
- **Screenshots:** `/opt/render/project/data/public/preaudit_screenshots/`
- **Audit Screenshots:** `/opt/render/project/data/public/audit_screenshots/`

## ✅ Success Indicators

Your deployment is successful when:
- ✅ Render shows "Deploy successful" (green checkmark)
- ✅ Site loads without errors
- ✅ Admin panel accessible
- ✅ Existing audits still visible (NO DATA LOST)
- ✅ `/admin/preaudits` page loads
- ✅ Test search completes successfully
- ✅ Screenshots display correctly
- ✅ "Proceed" creates audit job

## 📚 Documentation

- **Preaudits Setup:** See `PREAUDITS_SETUP.md`
- **Environment Variables:** See `ENV_EXAMPLE.md`
- **API Documentation:** See inline comments in service files

## 🎯 Next Steps After Deployment

1. **Run a Test Search:**
   - Navigate to `/admin/preaudits`
   - Search for 3-5 businesses in your niche
   - Verify results are correct
   - Try "Proceed" to create an audit

2. **Monitor Usage:**
   - Track Serper.dev API usage (free tier: 2,500/month)
   - Monitor storage usage for screenshots
   - Check Render logs for any errors

3. **Backup Database:**
   - Use `/admin` → "Create Backup" button
   - Download and store backups regularly
   - Test backup restore process

---

## 🚨 CRITICAL REMINDERS

- ✅ **NO DATA WILL BE DELETED** - All existing audits are preserved
- ✅ **Database migrations are SAFE** - Uses `CREATE TABLE IF NOT EXISTS`
- ✅ **Persistent storage configured** - Screenshots saved to disk
- ✅ **Status-based filtering** - No hard deletes, only status updates
- ✅ **Production-ready** - Comprehensive error handling

---

**Ready to deploy!** 🚀

Monitor Render dashboard for deployment status and check logs for any errors.
