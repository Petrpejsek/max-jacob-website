/**
 * E2E sanity run (manual): creates an audit job and runs full processAuditJob().
 *
 * NOTE: This is NOT included in `npm test` because it uses network + OpenRouter credits.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const auditPipeline = require('../server/services/auditPipeline');
const {
  createAuditJob,
  getAuditJobById
} = require('../server/db');

function pCreateAuditJob(payload) {
  return new Promise((resolve, reject) => {
    createAuditJob(payload, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function pGetAuditJobById(id) {
  return new Promise((resolve, reject) => {
    getAuditJobById(id, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function main() {
  const inputUrl = process.env.E2E_URL || 'https://wmplumbinginc.com/';

  const payload = {
    input_url: inputUrl,
    niche: 'plumbing',
    city: '', // will be auto-detected from scraped data (NO FALLBACKS)
    company_name: null,
    brand_logo_url: null,
    preset_id: null,
    status: 'draft'
  };

  const created = await pCreateAuditJob(payload);
  const jobId = created.id;
  console.log(`[E2E] Created audit job #${jobId} for ${inputUrl}`);

  await auditPipeline.processAuditJob(jobId, { settings: {}, promptOverrides: {} });

  const job = await pGetAuditJobById(jobId);

  console.log(`[E2E] Final status: ${job.status}`);
  console.log(`[E2E] public_page_slug: ${job.public_page_slug || 'N/A'}`);
  console.log(`[E2E] city: ${job.city || 'N/A'} | niche: ${job.niche || 'N/A'}`);
  console.log(`[E2E] llm_context_json: ${job.llm_context_json ? 'YES' : 'NO'}`);
  console.log(`[E2E] assistant_outputs_json keys:`, Object.keys(job.assistant_outputs_json || {}));
  console.log(`[E2E] public_page_json: ${job.public_page_json ? 'YES' : 'NO'}`);
  console.log(`[E2E] email_html length: ${(job.email_html || '').length}`);

  if (job.status !== 'ready') {
    throw new Error(`E2E failed: expected status 'ready', got '${job.status}' (error: ${job.error_message || 'none'})`);
  }
  if (!job.llm_context_json) throw new Error('E2E failed: missing llm_context_json');
  if (!job.assistant_outputs_json) throw new Error('E2E failed: missing assistant_outputs_json');
  if (!job.assistant_outputs_json.ux_audit_json) throw new Error('E2E failed: missing ux_audit_json');
  if (!job.assistant_outputs_json.local_seo_audit_json) throw new Error('E2E failed: missing local_seo_audit_json');
  if (!job.assistant_outputs_json.offer_copy_json) throw new Error('E2E failed: missing offer_copy_json');
  if (!job.assistant_outputs_json.email_pack_json) throw new Error('E2E failed: missing email_pack_json');
  if (!job.assistant_outputs_json.public_page_json) throw new Error('E2E failed: missing public_page_json');

  console.log('[E2E] OK: full pipeline completed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[E2E] FAILED:', err);
    process.exit(1);
  });

