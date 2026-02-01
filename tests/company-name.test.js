const assert = require('assert');

const {
  pickCompanyNameFromSignals,
  isLikelyBusinessName,
  deriveDomainFallbackName,
} = require('../server/helpers/companyName');

function run() {
  // 1) Reject service-list page title; fall back to pretty domain name
  {
    const res = pickCompanyNameFromSignals({
      htmlTitle: 'Emergency Miami Dade Plumbing, Gas Line, Sink Installation, Water Heater Repair',
      ogSiteName: null,
      orgName: null,
      localName: null,
      webName: null,
      inputUrl: 'https://miami-dade-plumbing.com/',
    });
    assert.strictEqual(res.name, 'Miami Dade Plumbing');
    assert.strictEqual(res.source, 'domain_fallback');
  }

  // 2) Prefer JSON-LD Organization when reasonable
  {
    const res = pickCompanyNameFromSignals({
      orgName: "Amy's Plumbing LLC",
      htmlTitle: 'Emergency Plumbing, Drain Cleaning, Water Heater Repair',
      inputUrl: 'https://example.com',
    });
    assert.strictEqual(res.name, "Amy's Plumbing LLC");
    assert.strictEqual(res.source, 'jsonld_organization');
  }

  // 3) Prefer OG site name over HTML title
  {
    const res = pickCompanyNameFromSignals({
      ogSiteName: 'ACME Plumbing',
      htmlTitle: 'ACME Plumbing - Emergency Plumbing, Drain Cleaning, Water Heater Repair',
      inputUrl: 'https://acmeplumbing.com',
    });
    assert.strictEqual(res.name, 'ACME Plumbing');
    assert.strictEqual(res.source, 'og_site_name');
  }

  // 4) Basic heuristic sanity
  assert.strictEqual(isLikelyBusinessName('ACME Plumbing'), true);
  assert.strictEqual(isLikelyBusinessName('Emergency Miami Dade Plumbing, Gas Line, Sink Installation, Water Heater Repair'), false);
  assert.strictEqual(deriveDomainFallbackName('https://foo-bar-baz.com'), 'Foo Bar Baz');

  console.log('OK: company-name.test.js');
}

run();

