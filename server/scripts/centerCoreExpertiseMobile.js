const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function patch(html) {
  let out = String(html || '');
  if (!out) return out;

  // Center the 3 Core Expertise cards on mobile (keep desktop alignment)
  const cardClass =
    'group relative bg-white rounded-[2.5rem] p-10 shadow-xl shadow-slate-200/50 border border-slate-100 hover:-translate-y-2 transition-all duration-300';

  if (out.includes(cardClass) && !out.includes(`${cardClass} text-center md:text-left`)) {
    out = out.replaceAll(cardClass, `${cardClass} text-center md:text-left`);
  }

  const btnClass =
    'flex items-center space-x-2 font-black text-blue-600 group-hover:text-blue-700 transition-colors';
  const btnClassNew =
    'flex items-center space-x-2 font-black text-blue-600 group-hover:text-blue-700 transition-colors justify-center md:justify-start';

  if (out.includes(btnClass) && !out.includes(btnClassNew)) {
    out = out.replaceAll(btnClass, btnClassNew);
  }

  return out;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[centerCoreExpertiseMobile] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[centerCoreExpertiseMobile] done', { total: rows.length, changed });
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
              console.error('[centerCoreExpertiseMobile] update failed:', row.id, row.public_page_slug, updateErr.message);
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

