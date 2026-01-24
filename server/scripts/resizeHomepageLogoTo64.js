const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function updateHeader(html) {
  let out = String(html || '');
  if (!out) return out;

  const navMatch = out.match(/<nav[^>]*id="header"[\s\S]*?<\/nav>/i);
  if (!navMatch) return out;

  const nav = navMatch[0];
  let newNav = nav;

  // Resize header row height to match smaller logo
  newNav = newNav
    .replace(/h-\[96px\]/g, 'h-[80px]')
    .replace(/md:h-\[112px\]/g, 'md:h-[96px]')
    // In case older variants exist
    .replace(/\bh-16\b/g, 'h-[80px]')
    .replace(/\bmd:h-20\b/g, 'md:h-[96px]');

  // Resize the logo image in header (match by alt containing "logo")
  newNav = newNav.replace(
    /(<img\b[^>]*\balt="[^"]*\blogo\b[^"]*"[^>]*\bclass=")([^"]*)(")/i,
    (m, pre, cls, post) => {
      let c = cls;
      c = c
        .replace(/\bh-10\b/g, '')
        .replace(/\bh-\[60px\]\b/g, '')
        .replace(/h-\[90px\]/g, '')
        .replace(/h-\[64px\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      c = `h-[64px] ${c}`.trim();
      return `${pre}${c}${post}`;
    }
  );

  return out.replace(nav, newNav);
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[resizeHomepageLogoTo64] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[resizeHomepageLogoTo64] done', { total: rows.length, changed });
        db.close();
        return;
      }

      const row = rows[idx++];
      const updated = updateHeader(row.homepage_proposal_html);
      if (updated && updated !== row.homepage_proposal_html) {
        db.run(
          'UPDATE audit_jobs SET homepage_proposal_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [updated, row.id],
          (updateErr) => {
            if (updateErr) {
              console.error('[resizeHomepageLogoTo64] update failed:', row.id, row.public_page_slug, updateErr.message);
            } else {
              changed += 1;
            }
            next();
          }
        );
      } else {
        next();
      }
    }

    next();
  }
);

