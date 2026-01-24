const assert = require('assert');

const { buildPayload } = require('../server/services/payloadBuilders');

function buildRawDump(pagesCount = 20, jsonLdCount = 50) {
  return {
    version: 'raw_dump_v2',
    pages: Array.from({ length: pagesCount }, (_, i) => ({
      page_url: `https://example.com/page-${i}`,
      page_type: i === 0 ? 'home' : 'other',
      title: `Page ${i}`,
      meta_description: `Description ${i}`,
      canonical: `https://example.com/page-${i}`,
      headings: {
        h1: `H1 ${i}`,
        h2: Array.from({ length: 25 }, (_, j) => `H2 ${i}.${j}`),
        h3: Array.from({ length: 40 }, (_, j) => `H3 ${i}.${j}`),
        h6: Array.from({ length: 40 }, (_, j) => `H6 ${i}.${j}`)
      },
      word_count: 123 + i,
      text_snippet: 'x'.repeat(5000),
      links_summary: {
        tel_links: Array.from({ length: 15 }, () => ({ text: 'Call', href: 'tel:+13055551234' })),
        internal_important_links: Array.from({ length: 25 }, () => ({ text: 'Contact', href: '/contact', intent: 'contact' }))
      }
    })),
    jsonld_raw: Array.from({ length: jsonLdCount }, (_, i) => ({ '@type': 'LocalBusiness', name: `Biz ${i}` })),
    jsonld_extracted: { localbusiness: { name: 'Example Biz' } }
  };
}

function run() {
  const job = { id: 123, niche: 'plumbing', city: 'Miami', input_url: 'https://example.com' };
  const llm_context = { company_profile: { name: 'Example Biz', phones: [], emails: [], address: null, hours: null, social_links: [] } };

  const raw_dump = buildRawDump();
  const screenshots = {
    desktop_above_fold: 'public/audit_screenshots/123/pages/page0-desktop-above-fold.png',
    desktop_full: 'public/audit_screenshots/123/pages/page0-desktop-full.png',
    mobile_above_fold: 'public/audit_screenshots/123/pages/page0-mobile-above-fold.png'
  };

  // A2 payload should include trimmed raw_dump and normalized screenshots
  const a2Payload = buildPayload('ux_conversion_auditor', { job, llm_context, raw_dump, screenshots });
  assert(a2Payload.raw_dump, 'A2 payload should include raw_dump');
  assert(Array.isArray(a2Payload.raw_dump.pages), 'A2 raw_dump.pages should be array');
  assert(a2Payload.raw_dump.pages.length === 8, `A2 raw_dump.pages should be trimmed to 8 (got ${a2Payload.raw_dump.pages.length})`);
  assert(Array.isArray(a2Payload.raw_dump.jsonld_raw), 'A2 raw_dump.jsonld_raw should be array');
  assert(a2Payload.raw_dump.jsonld_raw.length === 20, `A2 raw_dump.jsonld_raw should be trimmed to 20 (got ${a2Payload.raw_dump.jsonld_raw.length})`);

  assert(a2Payload.screenshots, 'A2 payload should include screenshots');
  assert.strictEqual(a2Payload.screenshots.refs.above_fold, screenshots.desktop_above_fold, 'above_fold should map from desktop_above_fold');
  assert.strictEqual(a2Payload.screenshots.refs.fullpage, screenshots.desktop_full, 'fullpage should map from desktop_full');
  assert.strictEqual(a2Payload.screenshots.refs.mobile_above_fold, screenshots.mobile_above_fold, 'mobile_above_fold should map');

  // A3 payload should include trimmed raw_dump
  const a3Payload = buildPayload('local_seo_geo_auditor', { job, llm_context, raw_dump, screenshots });
  assert(a3Payload.raw_dump, 'A3 payload should include raw_dump');
  assert(a3Payload.raw_dump.pages.length === 8, 'A3 raw_dump.pages should be trimmed to 8');

  // A1 payload should use trimmed raw_dump_pages_json
  const a1Payload = buildPayload('evidence_normalizer', { job, evidence_pack_v2: {}, raw_dump, screenshots });
  assert(Array.isArray(a1Payload.raw_dump_pages_json), 'A1 raw_dump_pages_json should be array');
  assert(a1Payload.raw_dump_pages_json.length === 8, `A1 raw_dump_pages_json should be trimmed to 8 (got ${a1Payload.raw_dump_pages_json.length})`);

  console.log('OK: payload-builders.test.js');
}

run();

