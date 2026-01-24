/**
 * Seed AI Assistants - Sync prompts from assistantPrompts.js to DB
 * 
 * Run this on production to ensure DB has latest prompts.
 * Usage: node server/scripts/seed-assistants.js
 */

const path = require('path');
const { getAllAssistantPrompts } = require('../services/assistantPrompts');
const db = require('../db');

// Assistant configuration (model, temperature, sort order)
const ASSISTANTS_CONFIG = [
  { 
    key: 'evidence_normalizer', 
    name: 'Evidence Normalizer', 
    model: 'openai/gpt-4.1', 
    temperature: 0.1, 
    sort_order: 1 
  },
  { 
    key: 'ux_conversion_auditor', 
    name: 'UX Conversion Auditor', 
    model: 'google/gemini-2.5-pro', 
    temperature: 0.2, 
    sort_order: 2 
  },
  { 
    key: 'local_seo_geo_auditor', 
    name: 'Local SEO & GEO Auditor', 
    model: 'openai/gpt-4.1', 
    temperature: 0.15, 
    sort_order: 3 
  },
  { 
    key: 'offer_strategist', 
    name: 'Offer Strategist', 
    model: 'anthropic/claude-3.7-sonnet', 
    temperature: 0.35, 
    sort_order: 4 
  },
  { 
    key: 'outreach_email_writer', 
    name: 'Outreach Email Writer', 
    model: 'openai/gpt-4.1', 
    temperature: 0.45, 
    sort_order: 5 
  },
  { 
    key: 'public_audit_page_composer', 
    name: 'Public Audit Page Composer', 
    model: 'google/gemini-2.5-pro', 
    temperature: 0.25, 
    sort_order: 6 
  }
];

async function seedAssistants() {
  console.log('[SEED ASSISTANTS] Starting...');
  
  // Get all prompts from code
  const prompts = getAllAssistantPrompts();
  console.log(`[SEED ASSISTANTS] Loaded ${Object.keys(prompts).length} prompts from assistantPrompts.js`);
  
  // Upsert each assistant
  for (const config of ASSISTANTS_CONFIG) {
    const prompt = prompts[config.key];
    
    if (!prompt) {
      console.warn(`[SEED ASSISTANTS] ⚠️ No prompt found for ${config.key}, skipping`);
      continue;
    }
    
    try {
      // Check if assistant already exists
      const existing = await new Promise((resolve, reject) => {
        db.getAssistantByKey(config.key, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (existing) {
        // Update existing
        console.log(`[SEED ASSISTANTS] Updating ${config.key}...`);
        await new Promise((resolve, reject) => {
          db.updateAssistant(existing.id, {
            name: config.name,
            key: config.key,  // MUST include key (NOT NULL constraint)
            model: config.model,
            temperature: config.temperature,
            prompt: prompt,
            sort_order: config.sort_order,
            is_active: 1
          }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`[SEED ASSISTANTS] ✅ Updated ${config.key}`);
      } else {
        // Insert new
        console.log(`[SEED ASSISTANTS] Creating ${config.key}...`);
        await new Promise((resolve, reject) => {
          db.createAssistant({
            name: config.name,
            key: config.key,
            model: config.model,
            temperature: config.temperature,
            prompt: prompt,
            sort_order: config.sort_order,
            is_active: 1
          }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
        console.log(`[SEED ASSISTANTS] ✅ Created ${config.key}`);
      }
    } catch (err) {
      console.error(`[SEED ASSISTANTS] ❌ Error processing ${config.key}:`, err.message);
      process.exit(1);
    }
  }
  
  console.log('[SEED ASSISTANTS] ✅ All assistants seeded successfully');
  console.log('[SEED ASSISTANTS] Verifying...');
  
  // Verify
  const all = await new Promise((resolve, reject) => {
    db.getAllAssistants((err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  
  console.log(`[SEED ASSISTANTS] Found ${all.length} active assistants in DB`);
  all.forEach(a => {
    console.log(`  - ${a.key} (${a.model}, temp=${a.temperature}, prompt=${a.prompt.length} chars)`);
  });
  
  process.exit(0);
}

// Run
seedAssistants().catch(err => {
  console.error('[SEED ASSISTANTS] FATAL ERROR:', err);
  process.exit(1);
});
