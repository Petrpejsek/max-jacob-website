#!/usr/bin/env node
/**
 * Payload Size Inspector
 * 
 * Inspects a specific audit job and shows payload sizes for each assistant
 * WITHOUT actually calling the LLM (for diagnostics)
 * 
 * Usage:
 *   node scripts/inspect-payload-size.js <jobId>
 */

const { loadJob } = require('../server/db');
const { buildPayload } = require('../server/services/payloadBuilders');
const { analyzePayload } = require('../server/services/tokenAnalytics');

// Parse command line arguments
const jobId = parseInt(process.argv[2], 10);

if (!jobId || isNaN(jobId)) {
  console.error('Usage: node scripts/inspect-payload-size.js <jobId>');
  console.error('Example: node scripts/inspect-payload-size.js 123');
  process.exit(1);
}

// Assistant pipeline sequence
const ASSISTANTS = [
  { key: 'evidence_normalizer', name: 'A1: Evidence Normalizer' },
  { key: 'ux_conversion_auditor', name: 'A2: UX Conversion Auditor' },
  { key: 'local_seo_geo_auditor', name: 'A3: Local SEO & GEO Auditor' },
  { key: 'offer_strategist', name: 'A4: Offer Strategist' },
  { key: 'outreach_email_writer', name: 'A5: Outreach Email Writer' },
  { key: 'public_audit_page_composer', name: 'A6: Public Audit Page Composer' }
];

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function inspectJob(jobId) {
  console.log(`\nInspecting Job ID: ${jobId}...\n`);

  // Load job from database
  const job = await new Promise((resolve, reject) => {
    loadJob(jobId, (err, data) => {
      if (err) return reject(err);
      if (!data) return reject(new Error(`Job ${jobId} not found`));
      resolve(data);
    });
  });

  console.log(`Job Info:`);
  console.log(`  URL: ${job.input_url}`);
  console.log(`  Niche: ${job.niche || 'N/A'}`);
  console.log(`  City: ${job.city || 'N/A'}`);
  console.log(`  Status: ${job.status}`);
  console.log('');

  // Prepare payload data
  const payload_data = {
    job,
    evidence_pack_v2: job.evidence_pack_v2_json ? JSON.parse(job.evidence_pack_v2_json) : null,
    raw_dump: job.raw_dump_json ? JSON.parse(job.raw_dump_json) : null,
    screenshots: job.screenshots_json ? JSON.parse(job.screenshots_json) : {},
    llm_context: job.llm_context_json ? JSON.parse(job.llm_context_json) : null
  };

  // Parse assistant outputs if available
  if (job.assistant_outputs_json) {
    const outputs = JSON.parse(job.assistant_outputs_json);
    payload_data.ux_audit_json = outputs.ux_audit_json || null;
    payload_data.local_seo_audit_json = outputs.local_seo_audit_json || null;
    payload_data.offer_copy_json = outputs.offer_copy_json || null;
  }

  payload_data.links = {
    audit_landing_url: job.public_page_slug ? `https://maxandjacob.com/${job.public_page_slug}?v=2&audit_id=${jobId}` : '#',
    questionnaire_url: 'https://maxandjacob.com/questionnaire'
  };

  console.log('='.repeat(80));
  console.log('PAYLOAD ANALYSIS BY ASSISTANT');
  console.log('='.repeat(80));

  let totalEstimatedTokens = 0;
  const warnings = [];

  for (const assistant of ASSISTANTS) {
    try {
      // Build payload for this assistant
      const payload = buildPayload(assistant.key, payload_data);
      
      // Analyze payload
      const analysis = analyzePayload(payload);
      totalEstimatedTokens += analysis.estimated_tokens;

      console.log(`\n${assistant.name} (${assistant.key})`);
      console.log('-'.repeat(80));
      console.log(`  Total Size: ${formatBytes(analysis.total_size_bytes)}`);
      console.log(`  Estimated Tokens: ~${analysis.estimated_tokens.toLocaleString()}`);
      
      // Show top 5 largest fields
      const sortedFields = Object.entries(analysis.fields)
        .sort((a, b) => b[1].size_bytes - a[1].size_bytes)
        .slice(0, 5);

      if (sortedFields.length > 0) {
        console.log(`  Largest Fields:`);
        sortedFields.forEach(([field, data]) => {
          console.log(`    - ${field}: ${formatBytes(data.size_bytes)} (${data.percentage}%, ~${data.estimated_tokens.toLocaleString()} tokens)`);
        });
      }

      // Show warnings
      if (analysis.warnings.length > 0) {
        console.log(`  ⚠️  Warnings:`);
        analysis.warnings.forEach(w => console.log(`    - ${w}`));
        warnings.push(...analysis.warnings.map(w => ({ assistant: assistant.key, warning: w })));
      }

      // Show duplicates
      if (analysis.duplicates.length > 0) {
        console.log(`  🔍 Optimizations:`);
        analysis.duplicates.forEach(d => {
          console.log(`    - ${d.message}`);
          if (d.size_bytes) {
            console.log(`      Size: ${formatBytes(d.size_bytes)}`);
          }
        });
      }

    } catch (error) {
      console.log(`\n${assistant.name} (${assistant.key})`);
      console.log('-'.repeat(80));
      console.log(`  ❌ Error: ${error.message}`);
      if (error.message.includes('Cannot read')) {
        console.log(`  (This is normal if the assistant hasn't run yet - dependencies missing)`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Estimated Input Tokens: ~${totalEstimatedTokens.toLocaleString()}`);
  console.log(`Estimated Cost (input only): ~$${((totalEstimatedTokens / 1000000) * 3.0).toFixed(4)}`);
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  Total Warnings: ${warnings.length}`);
  }

  console.log('');
}

// Run inspection
inspectJob(jobId).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
