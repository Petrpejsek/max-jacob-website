const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function patch(html) {
  let out = String(html || '');
  if (!out) return out;

  out = out.replace(
    'flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8',
    'flex flex-col items-center md:flex-row md:items-end justify-between mb-16 gap-8'
  );
  out = out.replace(
    'space-y-4 max-w-2xl',
    'space-y-4 max-w-2xl text-center md:text-left mx-auto md:mx-0'
  );
  out = out.replace(
    'flex flex-wrap gap-4',
    'flex flex-wrap gap-4 justify-center md:justify-end w-full md:w-auto'
  );

  return out;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[centerReviewsHeaderMobile] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[centerReviewsHeaderMobile] done', { total: rows.length, changed });
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
              console.error('[centerReviewsHeaderMobile] update failed:', row.id, row.public_page_slug, updateErr.message);
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

