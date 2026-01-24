const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

function patchServicesSection(html) {
  const out = String(html || '');
  if (!out) return out;

  const endOfHeadingNeedle = 'All Plumbing Services</h3>';
  const endOfHeadingIdx = out.indexOf(endOfHeadingNeedle);
  if (endOfHeadingIdx === -1) return out;

  // Start from the opening <h3 ...> tag for this heading
  const startIdx = out.lastIndexOf('<h3', endOfHeadingIdx);
  if (startIdx === -1) return out;

  // Find end of this left column area (right before the sticky "Why ..." card)
  const endNeedle = '<div class="bg-white rounded-[2rem] p-8 shadow-lg border border-slate-200';
  const endIdx = out.indexOf(endNeedle, startIdx);
  if (endIdx === -1) return out;

  const before = out.slice(0, startIdx);
  const middle = out.slice(startIdx, endIdx);
  const after = out.slice(endIdx);

  let m = middle;

  // Center section title on mobile
  m = m.replace(
    '<h3 class="text-3xl font-black text-slate-900 mb-10">All Plumbing Services</h3>',
    '<h3 class="text-3xl font-black text-slate-900 mb-10 text-center lg:text-left">All Plumbing Services</h3>'
  );

  // Center each service row on mobile (only within this section chunk)
  m = m.replace(
    /<div class="flex items-center space-x-3">/g,
    '<div class="flex items-center space-x-3 justify-center sm:justify-start">'
  );

  // Remove left padding on mobile + center text
  m = m.replace(
    /<p class="text-slate-600 pl-8 leading-relaxed font-medium text-sm">/g,
    '<p class="text-slate-600 pl-0 sm:pl-8 leading-relaxed font-medium text-sm text-center sm:text-left">'
  );

  return before + m + after;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[centerAllServicesMobile] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[centerAllServicesMobile] done', { total: rows.length, changed });
        db.close();
        return;
      }

      const row = rows[idx++];
      const updated = patchServicesSection(row.homepage_proposal_html);

      if (updated && updated !== row.homepage_proposal_html) {
        db.run(
          'UPDATE audit_jobs SET homepage_proposal_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [updated, row.id],
          (updateErr) => {
            if (updateErr) {
              console.error('[centerAllServicesMobile] update failed:', row.id, row.public_page_slug, updateErr.message);
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

