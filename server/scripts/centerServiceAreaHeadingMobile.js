const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function patch(html) {
  let out = String(html || '');
  if (!out) return out;

  out = out.replace(
    'text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight',
    'text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight text-center lg:text-left'
  );

  return out;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[centerServiceAreaHeadingMobile] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[centerServiceAreaHeadingMobile] done', { total: rows.length, changed });
        db.close();
        return;
      }

      const row = rows[idx++];
      const updated = patch(row.homepage_proposal_html);

      if (updated && updated !== row.homepage_proposal_html) {
        db.run(
          'UPDATE audit_jobs SET homepage_proposal_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [updated, row.id],
          (updateErr) => {
            if (updateErr) {
              console.error('[centerServiceAreaHeadingMobile] update failed:', row.id, row.public_page_slug, updateErr.message);
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

