/**
 * Output Validator - Evidence-First Validation for LLM Outputs
 * 
 * Validates assistant outputs to prevent hallucinations by:
 * 1. Checking JSON structure and required keys
 * 2. Validating evidence_ref arrays (if required by assistant)
 * 3. Ensuring evidence_ref paths have valid prefixes
 * 4. Checking for compliance violations (growth %, guarantees, etc.)
 */

/**
 * Assistant output schemas - defines required keys and structures
 */
const ASSISTANT_SCHEMAS = {
  evidence_normalizer: {
    // Matches assistantPrompts.js (A1) output (llm_context object directly, no wrapper)
    required_keys: [
      'company_profile',
      'services',
      'cta_analysis',
      'trust_evidence',
      'contact_friction',
      'quality_warnings'
    ],
    // Validate that required nested objects contain the keys promised by the prompt.
    // Note: some nested values may be null (e.g., address/hours), but the keys should exist.
    nested_required: {
      company_profile: ['name', 'phones', 'emails', 'address', 'hours', 'social_links'],
      services: ['featured', 'other_keywords'],
      cta_analysis: ['primary', 'all_ctas'],
      contact_friction: ['phone_in_header', 'phone_clickable', 'clicks_to_contact', 'form_detected']
    },
    // Type checks for stability in downstream consumers
    path_types: {
      company_profile: 'object',
      'company_profile.phones': 'array',
      'company_profile.emails': 'array',
      services: 'object',
      'services.featured': 'array',
      'services.other_keywords': 'array',
      cta_analysis: 'object',
      'cta_analysis.all_ctas': 'array',
      trust_evidence: 'array',
      contact_friction: 'object',
      quality_warnings: 'array'
    }
  },
  ux_conversion_auditor: {
    // Matches assistantPrompts.js (A2) output
    required_keys: ['top_issues', 'quick_wins', 'mobile_issues'],
    array_keys: ['top_issues', 'quick_wins', 'mobile_issues'],
    path_types: {
      top_issues: 'array',
      quick_wins: 'array',
      mobile_issues: 'array'
    }
  },
  local_seo_geo_auditor: {
    // Matches assistantPrompts.js (A3) output
    required_keys: ['nap_audit', 'local_signals', 'schema_markup', 'geo_ready_score'],
    nested_required: {
      nap_audit: ['status', 'issues'],
      local_signals: ['city_mentions', 'service_area'],
      schema_markup: ['local_business'],
      geo_ready_score: ['score', 'factors']
    },
    path_types: {
      nap_audit: 'object',
      'nap_audit.issues': 'array',
      local_signals: 'object',
      schema_markup: 'object',
      geo_ready_score: 'object',
      'geo_ready_score.factors': 'array',
      'schema_markup.local_business.missing_fields': 'array'
    }
  },
  offer_strategist: {
    // Matches assistantPrompts.js (A4) output
    required_keys: ['offer_package', 'upsell_paths', 'compliance_notes'],
    array_keys: ['upsell_paths', 'compliance_notes'],
    nested_required: {
      offer_package: ['headline', 'value_prop', 'deliverables', 'pricing_tier']
    },
    path_types: {
      offer_package: 'object',
      'offer_package.deliverables': 'array',
      upsell_paths: 'array',
      compliance_notes: 'array'
    }
  },
  outreach_email_writer: {
    // Matches assistantPrompts.js (A5) output
    required_keys: [
      'subject_lines',
      'email_body_html',
      'email_body_plaintext',
      'personalization_evidence',
      'cta_buttons'
    ],
    array_keys: ['subject_lines', 'personalization_evidence', 'cta_buttons'],
    path_types: {
      subject_lines: 'array',
      personalization_evidence: 'array',
      cta_buttons: 'array'
    }
  },
  public_audit_page_composer: {
    // Matches assistantPrompts.js (A6) output
    required_keys: [
      'page_meta',
      'hero',
      'findings_section',
      'concept_preview',
      'offer_section',
      'compliance_disclaimers'
    ],
    array_keys: ['compliance_disclaimers'],
    nested_required: {
      page_meta: ['title', 'description'],
      hero: ['headline', 'subheadline', 'screenshot_ref'],
      findings_section: ['findings'],
      concept_preview: ['disclaimer', 'headline', 'improvements', 'concept_image_url'],
      offer_section: ['headline', 'deliverables', 'cta']
    },
    path_types: {
      page_meta: 'object',
      hero: 'object',
      'findings_section.findings': 'array',
      'concept_preview.improvements': 'array',
      compliance_disclaimers: 'array'
    }
  }
};

/**
 * Valid evidence_ref prefixes
 */
const VALID_EVIDENCE_PREFIXES = [
  'evidence_pack_v2.',
  'llm_context.',
  'raw_dump.',
  'screenshots.refs.',
  'ux_audit_json.',
  'local_seo_audit_json.',
  'offer_copy_json.'
];

/**
 * Validate assistant output
 * 
 * @param {Object} assistant - Assistant record from DB (with requires_evidence_refs field)
 * @param {Object} output_json - Parsed JSON output from LLM
 * @returns {Object} - {valid: boolean, errors: string[]}
 */
function validateAssistantOutput(assistant, output_json) {
  const errors = [];
  const assistant_key = assistant.key;

  // 1. Check if output is valid object
  if (!output_json || typeof output_json !== 'object' || Array.isArray(output_json)) {
    errors.push('Output is not a valid JSON object');
    return { valid: false, errors };
  }

  // 2. Check required keys for this assistant
  const schema = ASSISTANT_SCHEMAS[assistant_key];
  if (schema) {
    // Check top-level required keys
    if (schema.required_keys) {
      schema.required_keys.forEach(key => {
        if (!(key in output_json)) {
          errors.push(`Missing required key: "${key}"`);
        }
      });
    }

    // Check array keys (should be arrays)
    if (schema.array_keys) {
      schema.array_keys.forEach(key => {
        if (key in output_json && !Array.isArray(output_json[key])) {
          errors.push(`Key "${key}" should be an array`);
        }
      });
    }

    // Check nested required keys
    if (schema.nested_required) {
      Object.keys(schema.nested_required).forEach(parentKey => {
        const parentVal = output_json[parentKey];
        if (!parentVal || typeof parentVal !== 'object' || Array.isArray(parentVal)) {
          errors.push(`Key "${parentKey}" should be an object`);
          return;
        }

        const nestedKeys = schema.nested_required[parentKey];
        nestedKeys.forEach(nestedKey => {
          if (!(nestedKey in parentVal)) {
            errors.push(`Missing required nested key: "${parentKey}.${nestedKey}"`);
          }
        });
      });
    }

    // Check required types for important paths (stability + fewer downstream crashes)
    if (schema.path_types) {
      Object.entries(schema.path_types).forEach(([path, expectedType]) => {
        const val = getValueAtPath(output_json, path);
        if (val === undefined) return; // Missing key handled by required/nested checks
        if (!matchesExpectedType(val, expectedType)) {
          errors.push(`Key "${path}" should be ${expectedType}`);
        }
      });
    }
  }

  // 3. Validate evidence_ref if required by assistant
  if (assistant.requires_evidence_refs) {
    const evidenceErrors = validateEvidenceRefs(assistant_key, output_json);
    errors.push(...evidenceErrors);
  }

  // 4. Check for compliance violations
  const complianceErrors = checkComplianceViolations(output_json);
  errors.push(...complianceErrors);

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate evidence_ref arrays in issues
 * 
 * @param {string} assistant_key
 * @param {Object} output_json
 * @returns {string[]} - Array of error messages
 */
function validateEvidenceRefs(assistant_key, output_json) {
  const errors = [];
  const issues = extractIssuesFromOutput(assistant_key, output_json);

  issues.forEach((issue, idx) => {
    // Check if evidence_ref exists
    if (!issue.evidence_ref) {
      errors.push(`Issue ${idx + 1} ("${issue.problem?.slice(0, 50) || 'Unknown'}"): Missing evidence_ref field`);
      return;
    }

    // Check if evidence_ref is array
    if (!Array.isArray(issue.evidence_ref)) {
      errors.push(`Issue ${idx + 1}: evidence_ref must be an array`);
      return;
    }

    // Check if evidence_ref is not empty
    if (issue.evidence_ref.length === 0) {
      errors.push(`Issue ${idx + 1} ("${issue.problem?.slice(0, 50) || 'Unknown'}"): evidence_ref array is empty`);
      return;
    }

    // Validate each evidence_ref path
    issue.evidence_ref.forEach((ref, refIdx) => {
      if (typeof ref !== 'string') {
        errors.push(`Issue ${idx + 1}, evidence_ref[${refIdx}]: Must be a string`);
        return;
      }

      // Check if ref has valid prefix
      const hasValidPrefix = VALID_EVIDENCE_PREFIXES.some(prefix => ref.startsWith(prefix));
      if (!hasValidPrefix) {
        errors.push(
          `Issue ${idx + 1}, evidence_ref[${refIdx}]: Invalid prefix. ` +
          `Must start with one of: ${VALID_EVIDENCE_PREFIXES.join(', ')}. ` +
          `Got: "${ref}"`
        );
      }
    });
  });

  return errors;
}

/**
 * Extract issues array from output based on assistant type
 * 
 * @param {string} assistant_key
 * @param {Object} output_json
 * @returns {Array} - Array of issue objects
 */
function extractIssuesFromOutput(assistant_key, output_json) {
  switch (assistant_key) {
    case 'ux_conversion_auditor':
      return [
        ...(output_json.top_issues || []),
        ...(output_json.mobile_issues || [])
      ];
    
    case 'local_seo_geo_auditor':
      // Extract issues from nap_audit.issues
      return (output_json.nap_audit?.issues || []);
    
    default:
      return [];
  }
}

/**
 * Get a nested value by dot path (e.g. "nap_audit.issues")
 */
function getValueAtPath(obj, path) {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const key of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Validate value types used by path_types.
 *
 * Supported expectedType values:
 * - "array"
 * - "object" (plain object, not array)
 * - "string"
 * - "number"
 * - "boolean"
 */
function matchesExpectedType(value, expectedType) {
  switch (expectedType) {
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true; // Unknown type spec => do not block
  }
}

/**
 * Check for compliance violations (banned phrases, growth %, etc.)
 * 
 * @param {Object} output_json
 * @returns {string[]} - Array of violation messages
 */
function checkComplianceViolations(output_json) {
  const violations = [];
  const jsonString = JSON.stringify(output_json).toLowerCase();

  // Banned patterns
  const bannedPatterns = [
    // IMPORTANT: avoid false-positives on URL-encoded sequences like "%20" or "%2C".
    // We only want to flag human-readable percent expressions like "30%".
    // (URL encoding is always "%[0-9A-Fa-f]{2}".)
    { pattern: /\b\d+\s*%(?![0-9a-f]{2})/i, message: 'Growth percentages or numeric projections are prohibited' },
    { pattern: /guarantee(d|s)?\s+(results|ranking|growth|traffic|leads)/i, message: 'Guarantees are prohibited (guaranteed results/ranking/growth)' },
    { pattern: /will\s+increase\s+(conversions|traffic|leads|sales)/i, message: 'Guarantees about results are prohibited ("will increase...")' },
    { pattern: /your\s+website\s+is\s+(bad|terrible|poor)/i, message: 'Negative framing about client website is prohibited' }
  ];

  bannedPatterns.forEach(({ pattern, message }) => {
    if (pattern.test(jsonString)) {
      violations.push(`Compliance violation: ${message}`);
    }
  });

  return violations;
}

/**
 * Get required keys for an assistant (for documentation/validation)
 * 
 * @param {string} assistant_key
 * @returns {Object} - Schema definition
 */
function getRequiredKeys(assistant_key) {
  return ASSISTANT_SCHEMAS[assistant_key] || null;
}

module.exports = {
  validateAssistantOutput,
  validateEvidenceRefs,
  extractIssuesFromOutput,
  checkComplianceViolations,
  getRequiredKeys,
  VALID_EVIDENCE_PREFIXES
};

