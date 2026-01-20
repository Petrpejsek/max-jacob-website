/**
 * Payload Builders for LLM Assistants v1
 * 
 * Each assistant has a specific payload structure based on:
 * - Required input data
 * - Dependencies on previous assistant outputs
 * - Evidence Pack v2 format
 */

/**
 * A1: Evidence Normalizer
 * 
 * Input: Raw scrape data (evidence_pack_v2, raw_dump, screenshots)
 * Output: llm_context_json + quality_warnings
 * 
 * @param {Object} job - Audit job record
 * @param {Object} evidence_pack_v2 - Evidence Pack v2 from scraper
 * @param {Object} raw_dump - Raw dump with pages array
 * @param {Object} screenshots - Screenshots refs and availability
 * @returns {Object} - Payload for A1
 */
function buildA1Payload(job, evidence_pack_v2, raw_dump, screenshots) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    evidence_pack_v2_json: evidence_pack_v2,
    raw_dump_pages_json: raw_dump.pages || [],
    screenshots: {
      refs: {
        above_fold: screenshots.above_fold || null,
        fullpage: screenshots.fullpage || null,
        contact_page: screenshots.contact_page || null,
        services_page: screenshots.services_page || null,
        reviews_page: screenshots.reviews_page || null
      },
      available: {
        above_fold: !!screenshots.above_fold,
        fullpage: !!screenshots.fullpage,
        contact_page: !!screenshots.contact_page,
        services_page: !!screenshots.services_page,
        reviews_page: !!screenshots.reviews_page
      }
    }
  };
}

/**
 * A2: UX Conversion Auditor
 * 
 * Input: llm_context from A1, screenshots
 * Output: ux_audit_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} screenshots
 * @returns {Object} - Payload for A2
 */
function buildA2Payload(job, llm_context, screenshots) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    screenshots: {
      refs: {
        above_fold: screenshots.above_fold || null,
        fullpage: screenshots.fullpage || null,
        mobile_above_fold: screenshots.mobile_above_fold || null
      },
      available: {
        above_fold: !!screenshots.above_fold,
        fullpage: !!screenshots.fullpage,
        mobile: !!screenshots.mobile_above_fold
      }
    }
  };
}

/**
 * A3: Local SEO & GEO Auditor
 * 
 * Input: llm_context from A1
 * Output: local_seo_audit_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @returns {Object} - Payload for A3
 */
function buildA3Payload(job, llm_context) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context
  };
}

/**
 * A4: Offer Strategist
 * 
 * Input: llm_context, ux_audit (A2), local_seo_audit (A3)
 * Output: offer_copy_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} ux_audit_json - Output from A2
 * @param {Object} local_seo_audit_json - Output from A3
 * @returns {Object} - Payload for A4
 */
function buildA4Payload(job, llm_context, ux_audit_json, local_seo_audit_json) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    ux_audit_json: ux_audit_json,
    local_seo_audit_json: local_seo_audit_json
  };
}

/**
 * A5: Outreach Email Writer
 * 
 * Input: llm_context, offer_copy (A4), links (audit landing, questionnaire)
 * Output: email_pack_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} offer_copy_json - Output from A4
 * @param {Object} links - {audit_landing_url, questionnaire_url}
 * @returns {Object} - Payload for A5
 */
function buildA5Payload(job, llm_context, offer_copy_json, links = {}) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    offer_copy_json: offer_copy_json,
    links: {
      audit_landing_url: links.audit_landing_url || '{{audit_landing_url}}',
      questionnaire_url: links.questionnaire_url || '{{questionnaire_url}}'
    }
  };
}

/**
 * A6: Public Audit Page Composer
 * 
 * Input: llm_context, ux_audit (A2), local_seo_audit (A3), offer_copy (A4), screenshots, compliance, links
 * Output: public_page_json
 * 
 * @param {Object} job
 * @param {Object} llm_context - Output from A1
 * @param {Object} ux_audit_json - Output from A2
 * @param {Object} local_seo_audit_json - Output from A3
 * @param {Object} offer_copy_json - Output from A4
 * @param {Object} screenshots
 * @param {Object} links - {questionnaire_url}
 * @returns {Object} - Payload for A6
 */
function buildA6Payload(job, llm_context, ux_audit_json, local_seo_audit_json, offer_copy_json, screenshots, links = {}) {
  return {
    job: {
      job_id: job.id,
      niche: job.niche,
      city: job.city,
      input_url: job.input_url
    },
    llm_context: llm_context,
    ux_audit_json: ux_audit_json,
    local_seo_audit_json: local_seo_audit_json,
    offer_copy_json: offer_copy_json,
    screenshots: {
      refs: {
        above_fold: screenshots.above_fold || null,
        fullpage: screenshots.fullpage || null
      },
      available: {
        above_fold: !!screenshots.above_fold,
        fullpage: !!screenshots.fullpage
      }
    },
    compliance: {
      concept_preview_required: true,
      no_growth_guarantees: true,
      no_shaming_language: true
    },
    links: {
      questionnaire_url: links.questionnaire_url || '{{questionnaire_url}}'
    }
  };
}

/**
 * Build payload for any assistant (dispatcher)
 * 
 * @param {string} assistant_key
 * @param {Object} data - Contains all possible dependencies
 * @returns {Object} - Payload for the assistant
 */
function buildPayload(assistant_key, data) {
  const {
    job,
    evidence_pack_v2,
    raw_dump,
    screenshots,
    llm_context,
    ux_audit_json,
    local_seo_audit_json,
    offer_copy_json,
    links
  } = data;

  switch (assistant_key) {
    case 'evidence_normalizer':
      return buildA1Payload(job, evidence_pack_v2, raw_dump, screenshots);
    
    case 'ux_conversion_auditor':
      return buildA2Payload(job, llm_context, screenshots);
    
    case 'local_seo_geo_auditor':
      return buildA3Payload(job, llm_context);
    
    case 'offer_strategist':
      return buildA4Payload(job, llm_context, ux_audit_json, local_seo_audit_json);
    
    case 'outreach_email_writer':
      return buildA5Payload(job, llm_context, offer_copy_json, links);
    
    case 'public_audit_page_composer':
      return buildA6Payload(job, llm_context, ux_audit_json, local_seo_audit_json, offer_copy_json, screenshots, links);
    
    default:
      throw new Error(`Unknown assistant_key: ${assistant_key}`);
  }
}

/**
 * Check if assistant can run (all dependencies available)
 * 
 * @param {string} assistant_key
 * @param {Object} data - Available data
 * @returns {Object} - {can_run: boolean, missing: string[]}
 */
function checkAssistantDependencies(assistant_key, data) {
  const missing = [];

  switch (assistant_key) {
    case 'evidence_normalizer':
      // A1 needs: evidence_pack_v2, raw_dump, screenshots from scraper
      if (!data.evidence_pack_v2) missing.push('evidence_pack_v2 (from scraper)');
      if (!data.raw_dump) missing.push('raw_dump (from scraper)');
      if (!data.screenshots) missing.push('screenshots (from scraper)');
      break;
    
    case 'ux_conversion_auditor':
      // A2 needs: llm_context from A1
      if (!data.llm_context) missing.push('llm_context (from A1: Evidence Normalizer)');
      break;
    
    case 'local_seo_geo_auditor':
      // A3 needs: llm_context from A1
      if (!data.llm_context) missing.push('llm_context (from A1: Evidence Normalizer)');
      break;
    
    case 'offer_strategist':
      // A4 needs: llm_context (A1), ux_audit_json (A2), local_seo_audit_json (A3)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.ux_audit_json) missing.push('ux_audit_json (from A2: UX Auditor)');
      if (!data.local_seo_audit_json) missing.push('local_seo_audit_json (from A3: SEO Auditor)');
      break;
    
    case 'outreach_email_writer':
      // A5 needs: llm_context (A1), offer_copy_json (A4)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.offer_copy_json) missing.push('offer_copy_json (from A4: Offer Strategist)');
      break;
    
    case 'public_audit_page_composer':
      // A6 needs: llm_context (A1), ux_audit_json (A2), local_seo_audit_json (A3), offer_copy_json (A4)
      if (!data.llm_context) missing.push('llm_context (from A1)');
      if (!data.ux_audit_json) missing.push('ux_audit_json (from A2)');
      if (!data.local_seo_audit_json) missing.push('local_seo_audit_json (from A3)');
      if (!data.offer_copy_json) missing.push('offer_copy_json (from A4)');
      break;
    
    default:
      missing.push(`Unknown assistant: ${assistant_key}`);
  }

  return {
    can_run: missing.length === 0,
    missing
  };
}

module.exports = {
  buildPayload,
  checkAssistantDependencies,
  buildA1Payload,
  buildA2Payload,
  buildA3Payload,
  buildA4Payload,
  buildA5Payload,
  buildA6Payload
};

