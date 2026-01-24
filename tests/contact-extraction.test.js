const assert = require('assert');

const scraperV3 = require('../server/services/scraperV3');

function run() {
  assert(scraperV3.__testHooks && scraperV3.__testHooks.extractNAP, 'scraperV3.__testHooks.extractNAP must be available');
  const { extractNAP } = scraperV3.__testHooks;

  // 1) tel: link with no visible text (icon-only CTA)
  {
    const nap = extractNAP('', [], {
      cta_candidates: [
        { text: '', href: 'tel:+13055551234' }
      ],
      content_text: ''
    });
    assert.strictEqual(nap.phone, '+13055551234', 'should extract phone from tel: href');
    assert.strictEqual(nap.text_phone, '+13055551234', 'text_phone should default to phone when SMS not provided');
  }

  // 2) sms: link should populate text_phone and also phone (fallback)
  {
    const nap = extractNAP('', [], {
      cta_candidates: [
        { text: '', href: 'sms:+14075550123' }
      ],
      content_text: ''
    });
    assert.strictEqual(nap.text_phone, '+14075550123', 'should extract text_phone from sms: href');
    assert.strictEqual(nap.phone, '+14075550123', 'phone should fall back to sms number when tel: not provided');
  }

  // 3) mailto: link should populate email
  {
    const nap = extractNAP('', [], {
      cta_candidates: [
        { text: '', href: 'mailto:hello@example.com?subject=Hi' }
      ],
      content_text: ''
    });
    assert.strictEqual(nap.email, 'hello@example.com', 'should extract email from mailto: href');
  }

  // 4) JSON-LD Organization.contactPoint.telephone
  {
    const jsonldBlocks = [
      {
        '@type': 'Organization',
        name: 'Test Co',
        contactPoint: { '@type': 'ContactPoint', telephone: '+1 305 555 1234' }
      }
    ];
    const nap = extractNAP('', jsonldBlocks, { cta_candidates: [], content_text: '' });
    assert.strictEqual(nap.phone, '+1 305 555 1234', 'should extract phone from JSON-LD contactPoint.telephone');
  }

  // 5) Email from body text fallback
  {
    const nap = extractNAP('Contact us at sales@example.com for pricing.', [], { cta_candidates: [], content_text: '' });
    assert.strictEqual(nap.email, 'sales@example.com', 'should extract email from visible text');
  }

  // 6) City extraction from string address in JSON-LD
  {
    const jsonldBlocks = [
      {
        '@type': 'LocalBusiness',
        name: "Amy's Plumbing",
        address: '1150 SW 27th Ave, Fort Lauderdale, FL, 33312',
        telephone: '(954) 530-0241'
      }
    ];
    const nap = extractNAP('', jsonldBlocks, { cta_candidates: [], content_text: '' });
    assert.strictEqual(nap.city, 'Fort Lauderdale', 'should extract multi-word city from string address');
  }

  console.log('OK: contact-extraction.test.js');
}

run();

