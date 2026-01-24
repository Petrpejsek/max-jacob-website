const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function upgradeHeader(html) {
  let out = String(html || '');
  if (!out) return out;

  const navMatch = out.match(/<nav[^>]*id="header"[\s\S]*?<\/nav>/i);
  if (!navMatch) return out;

  const nav = navMatch[0];
  let newNav = nav;

  // 1) Increase navbar height (mobile + md)
  // Only touch the specific nav flex row height tokens.
  newNav = newNav
    .replace(/\bh-16\b/g, 'h-[96px]')
    .replace(/\bmd:h-20\b/g, 'md:h-[112px]');

  // 2) Increase ONLY the header logo image height (match by alt="... logo")
  newNav = newNav.replace(
    /(<img\b[^>]*\balt="[^"]*\blogo\b[^"]*"[^>]*\bclass=")([^"]*)(")/i,
    (m, pre, cls, post) => {
      let c = cls;
      // Remove common old height tokens
      c = c
        .replace(/\bh-10\b/g, '')
        .replace(/\bh-\[60px\]\b/g, '')
        .replace(/\bh-\[90px\]\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Ensure fixed logo height is present
      c = `h-[90px] ${c}`.trim();
      return `${pre}${c}${post}`;
    }
  );

  // Replace nav block in full HTML
  out = out.replace(nav, newNav);
  return out;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[upgradeHomepageLogoSize] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[upgradeHomepageLogoSize] done', { total: rows.length, changed });
        db.close();
        return;
      }

      const row = rows[idx++];
      const upgraded = upgradeHeader(row.homepage_proposal_html);

      if (upgraded && upgraded !== row.homepage_proposal_html) {
        db.run(
          'UPDATE audit_jobs SET homepage_proposal_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [upgraded, row.id],
          (updateErr) => {
            if (updateErr) {
              console.error('[upgradeHomepageLogoSize] update failed:', row.id, row.public_page_slug, updateErr.message);
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

