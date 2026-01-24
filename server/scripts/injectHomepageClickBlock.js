const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data.db');
const db = new sqlite3.Database(dbPath);

const MARK = '__MJ_PREVIEW_CLICKBLOCK__';

function injectClickBlock(input) {
  let html = String(input || '');
  if (!html) return html;
  if (html.includes(MARK)) return html;

  const script = `
<script>
/* ${MARK} */
(function () {
  function block(e) {
    try { e.preventDefault(); } catch (_) {}
    try { e.stopPropagation(); } catch (_) {}
    try { e.stopImmediatePropagation(); } catch (_) {}
    return false;
  }
  // Capture phase so we intercept before any template handlers.
  document.addEventListener('click', block, true);
  document.addEventListener('submit', block, true);
  document.addEventListener('mousedown', block, true);
  document.addEventListener('mouseup', block, true);
  document.addEventListener('pointerdown', block, true);
  document.addEventListener('pointerup', block, true);
  document.addEventListener('keydown', function (e) {
    const k = e && e.key;
    if (k === 'Enter' || k === ' ') return block(e);
  }, true);
  window.__mjPreviewClicksBlocked = true;
})();
</script>
`;

  // Prefer injecting early (inside <head>) so our handler is registered first.
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${script}</head>`);
  }
  return `${script}${html}`;
}

db.all(
  'SELECT id, public_page_slug, homepage_proposal_html FROM audit_jobs WHERE homepage_proposal_html IS NOT NULL',
  (err, rows) => {
    if (err) {
      console.error('[injectHomepageClickBlock] query failed:', err);
      db.close();
      process.exit(1);
    }

    let changed = 0;
    let idx = 0;

    function next() {
      if (idx >= rows.length) {
        console.log('[injectHomepageClickBlock] done', { total: rows.length, changed });
        db.close();
        return;
      }

      const row = rows[idx++];
      const out = injectClickBlock(row.homepage_proposal_html);

      if (out && out !== row.homepage_proposal_html) {
        db.run(
          'UPDATE audit_jobs SET homepage_proposal_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [out, row.id],
          (updateErr) => {
            if (updateErr) {
              console.error('[injectHomepageClickBlock] update failed:', row.id, row.public_page_slug, updateErr.message);
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

