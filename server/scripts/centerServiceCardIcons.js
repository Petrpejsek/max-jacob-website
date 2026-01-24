const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function patch(html) {
  let out = String(html || '');
  if (!out) return out;

  // Only target the exact icon-bubble wrappers in the 3 "Core Expertise" cards.
  out = out.replace(
    /mb-8 inline-flex p-5 rounded-\[2\.5rem\] p-10 shadow-xl shadow-slate-200\/50 border border-slate-100 hover:-translate-y-2 transition-all duration-300/g,
    (m) => m
  );

  // Replace the three known icon containers (specific classes) from inline-flex to centered block flex.
  out = out.replace(
    /mb-8 inline-flex p-5 rounded-\[2rem\] bg-blue-50 text-blue-600 border border-blue-100/g,
    'mb-8 flex w-fit mx-auto p-5 rounded-[2rem] bg-blue-50 text-blue-600 border border-blue-100'
  );
  out = out.replace(
    /mb-8 inline-flex p-5 rounded-\[2rem\] bg-slate-50 text-slate-700 border border-slate-200/g,
    'mb-8 flex w-fit mx-auto p-5 rounded-[2rem] bg-slate-50 text-slate-700 border border-slate-200'
  );
  out = out.replace(
    /mb-8 inline-flex p-5 rounded-\[2rem\] bg-red-50 text-red-600 border border-red-100/g,
    'mb-8 flex w-fit mx-auto p-5 rounded-[2rem] bg-red-50 text-red-600 border border-red-100'
  );

  return out;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[centerServiceCardIcons] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[centerServiceCardIcons] done', { total: rows.length, changed });
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
              console.error('[centerServiceCardIcons] update failed:', row.id, row.public_page_slug, updateErr.message);
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

