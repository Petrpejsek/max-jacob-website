const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { getSqliteDbPath } = require('./runtimePaths');

// Vytvoření/připojení k databázi
// Pro produkci použijeme persistent disk nebo vytvoříme databázi v aktuálním adresáři
const dbPath = getSqliteDbPath();
try {
  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (e) {
  console.warn('Failed to ensure DB directory exists:', e.message);
}
console.log('Database path:', dbPath);
console.log('Working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Zkusíme vytvořit databázi s WRITE mode, aby se vytvořila pokud neexistuje
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    console.error('Database path was:', dbPath);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    // Test, jestli můžeme psát do databáze
  // Production-ready SQLite configuration
  db.run('PRAGMA journal_mode=WAL;', (pragmaErr) => {
    if (pragmaErr) {
      console.error('Error setting WAL mode:', pragmaErr);
    } else {
      console.log('Database WAL mode enabled');
    }
  });
  
  db.run('PRAGMA busy_timeout=5000;', () => {}); // 5s timeout for locks
  db.run('PRAGMA foreign_keys=ON;', () => {}); // Enforce foreign keys
  db.run('PRAGMA synchronous=NORMAL;', () => {}); // Good balance for WAL mode
  
  initDatabase();
  }
});

// Inicializace databázové struktury
function initDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      email TEXT NOT NULL,
      name TEXT,
      company TEXT,
      website TEXT,
      zip_code TEXT,
      needs_help_with TEXT,
      industry TEXT,
      budget_range TEXT,
      timeline TEXT,
      message TEXT NOT NULL,
      has_attachment INTEGER DEFAULT 0,
      ip_address TEXT,
      selected_package TEXT
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('Error creating contact_submissions table:', err);
    } else {
      console.log('Table contact_submissions ready');
      
      // Add new columns if they don't exist (for existing databases)
      db.run('ALTER TABLE contact_submissions ADD COLUMN phone TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.error('Error adding phone column:', alterErr);
        }
      });
      
      db.run('ALTER TABLE contact_submissions ADD COLUMN selected_week TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.error('Error adding selected_week column:', alterErr);
        }
      });
    }
  });

  // Vytvoření tabulky pro web-project-form
  const createWebProjectTableSQL = `
    CREATE TABLE IF NOT EXISTS web_project_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      company_name TEXT,
      current_website TEXT,
      contacts TEXT,
      main_goal TEXT,
      target_audience TEXT,
      pages_needed TEXT,
      estimated_pages TEXT,
      main_sections TEXT,
      required_languages TEXT,
      features TEXT,
      custom_features TEXT,
      visual_identity TEXT,
      liked_websites TEXT,
      business_description TEXT,
      content_help TEXT,
      hosting_domain TEXT,
      technical_requirements TEXT,
      deadline TEXT,
      has_branding_files INTEGER DEFAULT 0,
      has_content_files INTEGER DEFAULT 0,
      ip_address TEXT
    )
  `;

  db.run(createWebProjectTableSQL, (err) => {
    if (err) {
      console.error('Error creating web_project_submissions table:', err);
    } else {
      console.log('Table web_project_submissions ready');
    }
  });

  // Vytvoření tabulky pro audit jobs
  const createAuditJobsTableSQL = `
    CREATE TABLE IF NOT EXISTS audit_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'draft',
      input_url TEXT,
      niche TEXT,
      city TEXT,
      company_name TEXT,
      brand_logo_url TEXT,
      preset_id INTEGER,
      scrape_result_json TEXT,
      screenshots_json TEXT,
      llm_config_snapshot TEXT,
      mini_audit_json TEXT,
      email_html TEXT,
      public_page_slug TEXT,
      public_page_json TEXT,
      error_message TEXT,
      raw_dump_json TEXT,
      evidence_pack_json TEXT,
      site_snapshot_json TEXT,
      FOREIGN KEY (preset_id) REFERENCES niche_presets(id)
    )
  `;

  db.run(createAuditJobsTableSQL, (err) => {
    if (err) {
      console.error('Error creating audit_jobs table:', err);
    } else {
      console.log('Table audit_jobs ready');
      // Try to add preset_id column if table already exists (migration)
      db.run('ALTER TABLE audit_jobs ADD COLUMN preset_id INTEGER', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column preset_id already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column preset_id added to audit_jobs');
        }
      });
      // Add raw_dump_json column (migration for existing databases)
      db.run('ALTER TABLE audit_jobs ADD COLUMN raw_dump_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column raw_dump_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column raw_dump_json added to audit_jobs');
        }
      });
      // Add evidence_pack_json column (migration for existing databases)
      db.run('ALTER TABLE audit_jobs ADD COLUMN evidence_pack_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column evidence_pack_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column evidence_pack_json added to audit_jobs');
        }
      });
      // Add evidence_pack_v2_json column (Evidence Pack v2 format)
      db.run('ALTER TABLE audit_jobs ADD COLUMN evidence_pack_v2_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column evidence_pack_v2_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column evidence_pack_v2_json added to audit_jobs');
        }
      });
      // Add warnings_json column (data quality warnings for fast querying)
      db.run('ALTER TABLE audit_jobs ADD COLUMN warnings_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column warnings_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column warnings_json added to audit_jobs');
        }
      });
      // Add logo_scraped_url column (automatically detected logo URL)
      db.run('ALTER TABLE audit_jobs ADD COLUMN logo_scraped_url TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column logo_scraped_url already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column logo_scraped_url added to audit_jobs');
        }
      });
      // Add logo_scraped_source column (where logo was found)
      db.run('ALTER TABLE audit_jobs ADD COLUMN logo_scraped_source TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column logo_scraped_source already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column logo_scraped_source added to audit_jobs');
        }
      });
      // Add logo_stored_path column (local copy of logo)
      db.run('ALTER TABLE audit_jobs ADD COLUMN logo_stored_path TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column logo_stored_path already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column logo_stored_path added to audit_jobs');
        }
      });
      // Add llm_context_json column (LLM Assistants v1 - normalized context from A1)
      db.run('ALTER TABLE audit_jobs ADD COLUMN llm_context_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column llm_context_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column llm_context_json added to audit_jobs');
        }
      });
      // Add assistant_outputs_json column (LLM Assistants v1 - aggregated outputs from A2-A6)
      db.run('ALTER TABLE audit_jobs ADD COLUMN assistant_outputs_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column assistant_outputs_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column assistant_outputs_json added to audit_jobs');
        }
      });
      // Add data_quality_warnings_json column (LLM Assistants v1 - warnings from A1)
      db.run('ALTER TABLE audit_jobs ADD COLUMN data_quality_warnings_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column data_quality_warnings_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column data_quality_warnings_json added to audit_jobs');
        }
      });

      // Add site_snapshot_json column (aggregated site structure + content index for future reuse)
      db.run('ALTER TABLE audit_jobs ADD COLUMN site_snapshot_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column site_snapshot_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column site_snapshot_json added to audit_jobs');
        }
      });

      // Add homepage_proposal_html column (generated homepage HTML for preview)
      db.run('ALTER TABLE audit_jobs ADD COLUMN homepage_proposal_html TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column homepage_proposal_html already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column homepage_proposal_html added to audit_jobs');
        }
      });

      // Add homepage_proposal_data_json column (template variables used for generation)
      db.run('ALTER TABLE audit_jobs ADD COLUMN homepage_proposal_data_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column homepage_proposal_data_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column homepage_proposal_data_json added to audit_jobs');
        }
      });

      // Add error_message column (older DB compatibility)
      // Required for pipeline status transitions (scraping/evaluating/failed).
      db.run('ALTER TABLE audit_jobs ADD COLUMN error_message TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column error_message already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column error_message added to audit_jobs');
        }
      });
    }
  });

  // Vytvoření tabulky pro audit run logs
  const createAuditRunLogsTableSQL = `
    CREATE TABLE IF NOT EXISTS audit_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      step TEXT,
      level TEXT,
      message TEXT
    )
  `;

  db.run(createAuditRunLogsTableSQL, (err) => {
    if (err) {
      console.error('Error creating audit_run_logs table:', err);
    } else {
      console.log('Table audit_run_logs ready');
    }
  });

  // Vytvoření tabulky pro prompt templates
  const createPromptTemplatesTableSQL = `
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `;

  db.run(createPromptTemplatesTableSQL, (err) => {
    if (err) {
      console.error('Error creating prompt_templates table:', err);
    } else {
      console.log('Table prompt_templates ready');
      // Add assistant_key column (LLM Assistants v1 - link template to assistant)
      db.run('ALTER TABLE prompt_templates ADD COLUMN assistant_key TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column assistant_key already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column assistant_key added to prompt_templates');
        }
      });
      // Add template_version column (LLM Assistants v1 - semantic versioning)
      db.run('ALTER TABLE prompt_templates ADD COLUMN template_version TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column template_version already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column template_version added to prompt_templates');
        }
      });
    }
  });

  // Vytvoření tabulky pro AI asistenty
  const createAiAssistantsTableSQL = `
    CREATE TABLE IF NOT EXISTS ai_assistants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      model TEXT NOT NULL,
      temperature REAL NOT NULL,
      prompt TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createAiAssistantsTableSQL, (err) => {
    if (err) {
      console.error('Error creating ai_assistants table:', err);
    } else {
      console.log('Table ai_assistants ready');
      // Add requires_evidence_refs column (LLM Assistants v1 - marks assistants that need evidence validation)
      db.run('ALTER TABLE ai_assistants ADD COLUMN requires_evidence_refs INTEGER DEFAULT 0', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column requires_evidence_refs already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column requires_evidence_refs added to ai_assistants');
        }
      });
      // Inicializovat výchozí asistenty, pokud neexistují
      initializeDefaultAssistants();
    }
  });

  // Vytvoření tabulky pro assistant_runs (LLM Assistants v1 - complete audit trail)
  const createAssistantRunsTableSQL = `
    CREATE TABLE IF NOT EXISTS assistant_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      assistant_key TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL NOT NULL,
      prompt_template_id INTEGER,
      request_payload_json TEXT,
      response_text TEXT,
      response_json TEXT,
      status TEXT DEFAULT 'queued',
      error TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      token_usage_json TEXT,
      FOREIGN KEY (job_id) REFERENCES audit_jobs(id),
      FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id)
    )
  `;

  db.run(createAssistantRunsTableSQL, (err) => {
    if (err) {
      console.error('Error creating assistant_runs table:', err);
    } else {
      console.log('Table assistant_runs ready');
      // Add response_text column (migration for existing databases)
      db.run('ALTER TABLE assistant_runs ADD COLUMN response_text TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column response_text already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column response_text added to assistant_runs');
        }
      });
    }
  });

  // Vytvoření tabulky pro niche presets
  const createNichePresetsTableSQL = `
    CREATE TABLE IF NOT EXISTS niche_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      concept_image_url TEXT,
      default_headline TEXT,
      default_primary_cta TEXT,
      default_secondary_cta TEXT,
      default_city TEXT,
      default_bullets_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createNichePresetsTableSQL, (err) => {
    if (err) {
      console.error('Error creating niche_presets table:', err);
    } else {
      console.log('Table niche_presets ready');
      // Add homepage_template_path column (path to EJS template file)
      db.run('ALTER TABLE niche_presets ADD COLUMN homepage_template_path TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column homepage_template_path already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column homepage_template_path added to niche_presets');
        }
      });

      // Ensure default presets exist (production parity with local).
      // This does NOT migrate audits; it only guarantees baseline presets.
      db.get('SELECT id FROM niche_presets WHERE slug = ?', ['plumbing'], (selErr, existing) => {
        if (selErr) {
          console.error('[PRESETS] Error checking for plumbing preset:', selErr);
          return;
        }
        if (existing && existing.id) {
          console.log('[PRESETS] Default preset plumbing already exists; skipping seed');
          return;
        }

        console.log('[PRESETS] Seeding default preset: plumbing');
        // Local DB currently has exactly one preset: plumbing (empty defaults, bullets [])
        createNichePreset(
          {
            slug: 'plumbing',
            display_name: 'Plumbing',
            concept_image_url: null,
            default_headline: null,
            default_primary_cta: null,
            default_secondary_cta: null,
            default_city: null,
            default_bullets_json: []
          },
          (seedErr, result) => {
            if (seedErr) {
              console.error('[PRESETS] Failed to seed default preset plumbing:', seedErr);
            } else {
              console.log('[PRESETS] Seeded default preset plumbing with id:', result?.id);
            }
          }
        );
      });
    }
  });

  // Vytvoření tabulky pro crawled pages (Scraper v3)
  const createCrawledPagesTableSQL = `
    CREATE TABLE IF NOT EXISTS crawled_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_job_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      page_type TEXT,
      priority_score INTEGER DEFAULT 0,
      title TEXT,
      og_site_name TEXT,
      meta_description TEXT,
      canonical_url TEXT,
      h1_text TEXT,
      h2_json TEXT,
      h3_json TEXT,
      h6_json TEXT,
      word_count INTEGER DEFAULT 0,
      nav_primary_json TEXT,
      footer_nav_links_json TEXT,
      internal_links_count INTEGER DEFAULT 0,
      outbound_links_count INTEGER DEFAULT 0,
      top_outbound_domains_json TEXT,
      forms_count INTEGER DEFAULT 0,
      forms_summary_json TEXT,
      forms_detailed_json TEXT,
      ctas_json TEXT,
      cta_candidates_json TEXT,
      ctas_above_fold_json TEXT,
      has_tel_link INTEGER DEFAULT 0,
      has_mailto_link INTEGER DEFAULT 0,
      has_form INTEGER DEFAULT 0,
      trust_signals_json TEXT,
      trust_extracted_json TEXT,
      nap_json TEXT,
      cities_json TEXT,
      jsonld_blocks_json TEXT,
      jsonld_extracted_json TEXT,
      text_snippet TEXT,
      content_text TEXT,
      content_outline_json TEXT,
      images_json TEXT,
      services_extracted_json TEXT,
      brand_assets_json TEXT,
      screenshots_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (audit_job_id) REFERENCES audit_jobs(id)
    )
  `;

  db.run(createCrawledPagesTableSQL, (err) => {
    if (err) {
      console.error('Error creating crawled_pages table:', err);
    } else {
      console.log('Table crawled_pages ready');
      // Add cta_candidates_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN cta_candidates_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column cta_candidates_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column cta_candidates_json added to crawled_pages');
        }
      });
      // Add text_snippet column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN text_snippet TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column text_snippet already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column text_snippet added to crawled_pages');
        }
      });
      // Add forms_detailed_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN forms_detailed_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column forms_detailed_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column forms_detailed_json added to crawled_pages');
        }
      });
      // Add brand_assets_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN brand_assets_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column brand_assets_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column brand_assets_json added to crawled_pages');
        }
      });
      // Add jsonld_extracted_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN jsonld_extracted_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column jsonld_extracted_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column jsonld_extracted_json added to crawled_pages');
        }
      });
      // Add h6_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN h6_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column h6_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column h6_json added to crawled_pages');
        }
      });
      // Add trust_extracted_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN trust_extracted_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column trust_extracted_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column trust_extracted_json added to crawled_pages');
        }
      });
      // Add services_extracted_json column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN services_extracted_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column services_extracted_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column services_extracted_json added to crawled_pages');
        }
      });

      // Add og_site_name column (migration for existing databases)
      db.run('ALTER TABLE crawled_pages ADD COLUMN og_site_name TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column og_site_name already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column og_site_name added to crawled_pages');
        }
      });

      // Add nav_primary_json column (menu tree; usually only homepage)
      db.run('ALTER TABLE crawled_pages ADD COLUMN nav_primary_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column nav_primary_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column nav_primary_json added to crawled_pages');
        }
      });

      // Add footer_nav_links_json column
      db.run('ALTER TABLE crawled_pages ADD COLUMN footer_nav_links_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column footer_nav_links_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column footer_nav_links_json added to crawled_pages');
        }
      });

      // Add content_text column (fuller extracted page text; NOT sent to LLM)
      db.run('ALTER TABLE crawled_pages ADD COLUMN content_text TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column content_text already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column content_text added to crawled_pages');
        }
      });

      // Add content_outline_json column
      db.run('ALTER TABLE crawled_pages ADD COLUMN content_outline_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column content_outline_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column content_outline_json added to crawled_pages');
        }
      });

      // Add images_json column
      db.run('ALTER TABLE crawled_pages ADD COLUMN images_json TEXT', (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.log('Column images_json already exists or error:', alterErr.message);
        } else if (!alterErr) {
          console.log('Column images_json added to crawled_pages');
        }
      });
    }
  });

  // Vytvoření tabulky pro lighthouse reports (Scraper v3)
  const createLighthouseReportsTableSQL = `
    CREATE TABLE IF NOT EXISTS lighthouse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_job_id INTEGER NOT NULL,
      crawled_page_id INTEGER,
      url TEXT NOT NULL,
      page_type TEXT,
      performance_score REAL,
      accessibility_score REAL,
      best_practices_score REAL,
      seo_score REAL,
      fcp REAL,
      lcp REAL,
      cls REAL,
      tti REAL,
      report_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (audit_job_id) REFERENCES audit_jobs(id),
      FOREIGN KEY (crawled_page_id) REFERENCES crawled_pages(id)
    )
  `;

  db.run(createLighthouseReportsTableSQL, (err) => {
    if (err) {
      console.error('Error creating lighthouse_reports table:', err);
    } else {
      console.log('Table lighthouse_reports ready');
    }
  });

  // Site settings table (team photos, config)
  const createSiteSettingsTableSQL = `
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createSiteSettingsTableSQL, (err) => {
    if (err) {
      console.error('Error creating site_settings table:', err);
    } else {
      console.log('Table site_settings ready');
    }
  });
  
  // Test zápisu do databáze
  db.run('SELECT 1', (err) => {
    if (err) {
      console.error('Database write test failed:', err);
    } else {
      console.log('Database is writable');
    }
  });
}

// Vložení nového submission
function insertSubmission(data, callback) {
  const sql = `
    INSERT INTO contact_submissions (
      email, name, phone, website, 
      industry, timeline, message, 
      ip_address, selected_package, selected_week
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.email,
    data.name || null,
    data.phone || null,
    data.website || null,
    data.industry || null,
    data.timeline || null,
    data.message,
    data.ip_address || null,
    data.selected_package || null,
    data.selected_week || null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

// Získání všech submissions
function getAllSubmissions(callback) {
  const sql = `
    SELECT id, created_at, email, name, company, 
           budget_range, industry, selected_package
    FROM contact_submissions 
    ORDER BY created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

// Získání jednoho submission podle ID
function getSubmissionById(id, callback) {
  const sql = `
    SELECT * FROM contact_submissions WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      // Parsování JSON pole needs_help_with pokud existuje
      if (row && row.needs_help_with) {
        try {
          row.needs_help_with = JSON.parse(row.needs_help_with);
        } catch (e) {
          // If it's not valid JSON, leave it as string
        }
      }
      callback(null, row);
    }
  });
}

// Vložení web-project submission
function insertWebProjectSubmission(data, callback) {
  const sql = `
    INSERT INTO web_project_submissions (
      company_name, current_website, contacts, main_goal, target_audience,
      pages_needed, estimated_pages, main_sections, required_languages,
      features, custom_features, visual_identity, liked_websites,
      business_description, content_help, hosting_domain, technical_requirements,
      deadline, has_branding_files, has_content_files, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.company_name || null,
    data.current_website || null,
    typeof data.contacts === 'object' ? JSON.stringify(data.contacts) : data.contacts || null,
    data.main_goal || null,
    data.target_audience || null,
    data.pages_needed || null,
    data.estimated_pages || null,
    data.main_sections || null,
    data.required_languages || null,
    typeof data.features === 'object' ? JSON.stringify(data.features) : data.features || null,
    data.custom_features || null,
    data.visual_identity || null,
    data.liked_websites || null,
    data.business_description || null,
    data.content_help || null,
    data.hosting_domain || null,
    data.technical_requirements || null,
    data.deadline || null,
    data.has_branding_files ? 1 : 0,
    data.has_content_files ? 1 : 0,
    data.ip_address || null
  ];

  console.log('[DB] Inserting web-project submission with', params.length, 'params');
  console.log('[DB] Company name:', data.company_name);
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('[DB] Error inserting web-project submission:', err);
      console.error('[DB] Error code:', err.code);
      console.error('[DB] Error message:', err.message);
      callback(err, null);
    } else {
      console.log('[DB] Web-project submission inserted successfully, ID:', this.lastID);
      callback(null, { id: this.lastID });
    }
  });
}

// Získání všech web-project submissions
function getAllWebProjectSubmissions(callback) {
  const sql = `
    SELECT id, created_at, company_name, current_website, deadline
    FROM web_project_submissions 
    ORDER BY created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

// Získání jednoho web-project submission podle ID
function getWebProjectSubmissionById(id, callback) {
  const sql = `
    SELECT * FROM web_project_submissions WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      // Parsování JSON polí pokud existují
      if (row && row.contacts) {
        try {
          row.contacts = JSON.parse(row.contacts);
        } catch (e) {
          // Pokud to není validní JSON, necháme jako string
        }
      }
      if (row && row.features) {
        try {
          row.features = JSON.parse(row.features);
        } catch (e) {
          // Pokud to není validní JSON, necháme jako string
        }
      }
      callback(null, row);
    }
  });
}

// Audit Jobs: create
function createAuditJob(data, callback) {
  const sql = `
    INSERT INTO audit_jobs (
      status, input_url, niche, city, company_name, brand_logo_url, preset_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.status || 'draft',
    data.input_url,
    data.niche,
    data.city,
    data.company_name || null,
    data.brand_logo_url || null,
    data.preset_id || null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

// Audit Jobs: list
function getAuditJobs(callback) {
  const sql = `
    SELECT id, created_at, updated_at, status, input_url, niche, city, public_page_slug
    FROM audit_jobs
    ORDER BY created_at DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

// Audit Jobs: detail
function getAuditJobById(id, callback) {
  const sql = `
    SELECT *
    FROM audit_jobs
    WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      if (row) {
        row.scrape_result_json = safeJsonParse(row.scrape_result_json);
        row.screenshots_json = safeJsonParse(row.screenshots_json);
        row.llm_config_snapshot = safeJsonParse(row.llm_config_snapshot);
        row.mini_audit_json = safeJsonParse(row.mini_audit_json);
        row.public_page_json = safeJsonParse(row.public_page_json);
        row.raw_dump_json = safeJsonParse(row.raw_dump_json);
        row.evidence_pack_json = safeJsonParse(row.evidence_pack_json);
        row.evidence_pack_v2_json = safeJsonParse(row.evidence_pack_v2_json);
        row.warnings_json = safeJsonParse(row.warnings_json);
        row.llm_context_json = safeJsonParse(row.llm_context_json);
        row.assistant_outputs_json = safeJsonParse(row.assistant_outputs_json);
        row.data_quality_warnings_json = safeJsonParse(row.data_quality_warnings_json);
          row.site_snapshot_json = safeJsonParse(row.site_snapshot_json);
      }
      callback(null, row);
    }
  });
}

// Audit Jobs: find by public slug
function getAuditJobBySlug(slug, callback) {
  const sql = `
    SELECT *
    FROM audit_jobs
    WHERE public_page_slug = ?
  `;

  db.get(sql, [slug], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      if (row) {
        row.scrape_result_json = safeJsonParse(row.scrape_result_json);
        row.screenshots_json = safeJsonParse(row.screenshots_json);
        row.llm_config_snapshot = safeJsonParse(row.llm_config_snapshot);
        row.mini_audit_json = safeJsonParse(row.mini_audit_json);
        row.public_page_json = safeJsonParse(row.public_page_json);
        row.raw_dump_json = safeJsonParse(row.raw_dump_json);
        row.evidence_pack_json = safeJsonParse(row.evidence_pack_json);
        row.evidence_pack_v2_json = safeJsonParse(row.evidence_pack_v2_json);
        row.warnings_json = safeJsonParse(row.warnings_json);
        row.llm_context_json = safeJsonParse(row.llm_context_json);
        row.assistant_outputs_json = safeJsonParse(row.assistant_outputs_json);
        row.data_quality_warnings_json = safeJsonParse(row.data_quality_warnings_json);
        row.site_snapshot_json = safeJsonParse(row.site_snapshot_json);
        row.homepage_proposal_data_json = safeJsonParse(row.homepage_proposal_data_json);
      }
      callback(null, row);
    }
  });
}

const AUDIT_JOB_UPDATE_FIELDS = new Set([
  'status',
  'input_url',
  'niche',
  'city',
  'company_name',
  'brand_logo_url',
  'preset_id',
  'scrape_result_json',
  'screenshots_json',
  'llm_config_snapshot',
  'mini_audit_json',
  'email_html',
  'public_page_slug',
  'public_page_json',
  'error_message',
  'raw_dump_json',
  'evidence_pack_json',
  // Evidence Pack v2 + warnings
  'evidence_pack_v2_json',
  'warnings_json',
  // Scraped logo tracking
  'logo_scraped_url',
  'logo_scraped_source',
  'logo_stored_path',
  // LLM Assistants v1
  'llm_context_json',
  'assistant_outputs_json',
  'data_quality_warnings_json',
  // Aggregated site snapshot for future reuse
  'site_snapshot_json',
  // Homepage proposal
  'homepage_proposal_html',
  'homepage_proposal_data_json'
]);

function updateAuditJob(id, updates, callback) {
  const keys = Object.keys(updates || {}).filter((key) => AUDIT_JOB_UPDATE_FIELDS.has(key));

  if (keys.length === 0) {
    console.log('[DB] No valid fields to update for audit job', id);
    return callback(new Error('No valid fields to update'), null);
  }

  const setClauses = keys.map((key) => `${key} = ?`).join(', ');
  const params = keys.map((key) => {
    const value = updates[key];
    // Handle JSON fields
    if (typeof value === 'object' && value !== null && key.includes('_json')) {
      return JSON.stringify(value);
    }
    return value;
  });
  params.push(id);

  const sql = `
    UPDATE audit_jobs
    SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  console.log('[DB] Updating audit job', id, 'with fields:', keys);

  db.run(sql, params, function(err) {
    if (err) {
      console.error('[DB] Error updating audit job', id, ':', err.message);
      console.error('[DB] SQL:', sql);
      console.error('[DB] Params:', params);
      callback(err, null);
    } else {
      console.log('[DB] Updated audit job', id, '- changes:', this.changes);
      callback(null, { changes: this.changes });
    }
  });
}

// Contact Submissions: delete
function deleteSubmission(id, callback) {
  db.run('DELETE FROM contact_submissions WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('[DB] Error deleting contact_submission', id, ':', err.message);
      return callback(err);
    }
    
    console.log('[DB] Successfully deleted contact_submission', id, '- changes:', this.changes);
    callback(null, { changes: this.changes });
  });
}

// Web Project Submissions: delete
function deleteWebProjectSubmission(id, callback) {
  db.run('DELETE FROM web_project_submissions WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('[DB] Error deleting web_project_submission', id, ':', err.message);
      return callback(err);
    }
    
    console.log('[DB] Successfully deleted web_project_submission', id, '- changes:', this.changes);
    callback(null, { changes: this.changes });
  });
}

// Audit Jobs: delete (cascade delete related data)
function deleteAuditJob(id, callback) {
  // Delete in sequence to handle foreign keys properly
  // 1. Delete assistant runs (uses job_id)
  db.run('DELETE FROM assistant_runs WHERE job_id = ?', [id], (err1) => {
    if (err1) {
      console.error('[DB] Error deleting assistant_runs for job', id, ':', err1.message);
      return callback(err1);
    }
    
    // 2. Delete lighthouse reports (uses audit_job_id)
    db.run('DELETE FROM lighthouse_reports WHERE audit_job_id = ?', [id], (err2) => {
      if (err2) {
        console.error('[DB] Error deleting lighthouse_reports for job', id, ':', err2.message);
        return callback(err2);
      }
      
      // 3. Delete crawled pages (uses audit_job_id)
      db.run('DELETE FROM crawled_pages WHERE audit_job_id = ?', [id], (err3) => {
        if (err3) {
          console.error('[DB] Error deleting crawled_pages for job', id, ':', err3.message);
          return callback(err3);
        }
        
        // 4. Delete audit run logs (uses job_id)
        db.run('DELETE FROM audit_run_logs WHERE job_id = ?', [id], (err4) => {
          if (err4) {
            console.error('[DB] Error deleting audit_run_logs for job', id, ':', err4.message);
            return callback(err4);
          }
          
          // 5. Finally delete the audit job itself
          db.run('DELETE FROM audit_jobs WHERE id = ?', [id], function(err5) {
            if (err5) {
              console.error('[DB] Error deleting audit_job', id, ':', err5.message);
              return callback(err5);
            }
            
            console.log('[DB] Successfully deleted audit job', id, '- changes:', this.changes);
            callback(null, { changes: this.changes });
          });
        });
      });
    });
  });
}

// Audit Jobs: find by URL (for duplicate detection)
function getAuditJobByUrl(url, callback) {
  const sql = `
    SELECT id, niche, city, company_name, created_at, status
    FROM audit_jobs
    WHERE input_url = ?
    ORDER BY created_at DESC
  `;
  
  db.all(sql, [url], (err, rows) => {
    if (err) {
      console.error('[DB] Error finding audit jobs by URL:', err.message);
      callback(err, null);
    } else {
      callback(null, rows || []);
    }
  });
}

// Audit Run Logs
function appendAuditRunLog(jobId, step, level, message, callback) {
  const sql = `
    INSERT INTO audit_run_logs (job_id, step, level, message)
    VALUES (?, ?, ?, ?)
  `;

  db.run(sql, [jobId, step || null, level || 'info', message || null], function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function getAuditRunLogs(jobId, callback) {
  const sql = `
    SELECT id, created_at, step, level, message
    FROM audit_run_logs
    WHERE job_id = ?
    ORDER BY created_at ASC
  `;

  db.all(sql, [jobId], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

// Prompt Templates
function getActivePromptTemplates(callback) {
  const sql = `
    SELECT name, version, content
    FROM prompt_templates
    WHERE is_active = 1
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

function createPromptTemplateVersion(name, content, callback) {
  const selectSql = `
    SELECT MAX(version) as maxVersion
    FROM prompt_templates
    WHERE name = ?
  `;

  db.get(selectSql, [name], (err, row) => {
    if (err) {
      return callback(err, null);
    }

    const nextVersion = (row && row.maxVersion ? row.maxVersion : 0) + 1;

    db.run(
      'UPDATE prompt_templates SET is_active = 0 WHERE name = ?',
      [name],
      (updateErr) => {
        if (updateErr) {
          return callback(updateErr, null);
        }

        const insertSql = `
          INSERT INTO prompt_templates (name, version, content, is_active)
          VALUES (?, ?, ?, 1)
        `;

        db.run(insertSql, [name, nextVersion, content], function(insertErr) {
          if (insertErr) {
            callback(insertErr, null);
          } else {
            callback(null, { id: this.lastID, version: nextVersion });
          }
        });
      }
    );
  });
}

function safeJsonParse(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

// Niche Presets CRUD operations
function createNichePreset(data, callback) {
  const sql = `
    INSERT INTO niche_presets (
      slug, display_name, concept_image_url, default_headline, 
      default_primary_cta, default_secondary_cta, default_city, default_bullets_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.slug,
    data.display_name,
    data.concept_image_url || null,
    data.default_headline || null,
    data.default_primary_cta || null,
    data.default_secondary_cta || null,
    data.default_city || null,
    data.default_bullets_json ? JSON.stringify(data.default_bullets_json) : null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function getAllNichePresets(callback) {
  const sql = `
    SELECT id, slug, display_name, concept_image_url, default_headline,
           default_primary_cta, default_secondary_cta, default_city,
           default_bullets_json, created_at, updated_at
    FROM niche_presets
    ORDER BY display_name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      // Parse JSON fields
      const parsed = (rows || []).map(row => {
        if (row.default_bullets_json) {
          try {
            row.default_bullets_json = JSON.parse(row.default_bullets_json);
          } catch (e) {
            row.default_bullets_json = [];
          }
        }
        return row;
      });
      callback(null, parsed);
    }
  });
}

function getNichePresetById(id, callback) {
  const sql = `
    SELECT * FROM niche_presets WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      if (row && row.default_bullets_json) {
        try {
          row.default_bullets_json = JSON.parse(row.default_bullets_json);
        } catch (e) {
          row.default_bullets_json = [];
        }
      }
      callback(null, row);
    }
  });
}

function getNichePresetBySlug(slug, callback) {
  const sql = `
    SELECT * FROM niche_presets WHERE slug = ?
  `;

  db.get(sql, [slug], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      if (row && row.default_bullets_json) {
        try {
          row.default_bullets_json = JSON.parse(row.default_bullets_json);
        } catch (e) {
          row.default_bullets_json = [];
        }
      }
      callback(null, row);
    }
  });
}

const NICHE_PRESET_UPDATE_FIELDS = new Set([
  'slug',
  'display_name',
  'concept_image_url',
  'default_headline',
  'default_primary_cta',
  'default_secondary_cta',
  'default_city',
  'default_bullets_json',
  'homepage_template_path'
]);

function updateNichePreset(id, updates, callback) {
  const keys = Object.keys(updates || {}).filter((key) => NICHE_PRESET_UPDATE_FIELDS.has(key));

  if (keys.length === 0) {
    return callback(new Error('No valid fields to update'), null);
  }

  const setClauses = keys.map((key) => `${key} = ?`).join(', ');
  const params = keys.map((key) => {
    if (key === 'default_bullets_json' && typeof updates[key] === 'object') {
      return JSON.stringify(updates[key]);
    }
    return updates[key];
  });
  params.push(id);

  const sql = `
    UPDATE niche_presets
    SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { changes: this.changes });
    }
  });
}

function deleteNichePreset(id, callback) {
  const sql = `DELETE FROM niche_presets WHERE id = ?`;
  
  db.run(sql, [id], function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { changes: this.changes });
    }
  });
}

// Crawled Pages (Scraper v3)
function insertCrawledPage(data, callback) {
  const sql = `
    INSERT INTO crawled_pages (
      audit_job_id, url, normalized_url, page_type, priority_score,
      title, og_site_name, meta_description, canonical_url, h1_text, h2_json, h3_json, h6_json,
      word_count, nav_primary_json, footer_nav_links_json,
      internal_links_count, outbound_links_count, top_outbound_domains_json,
      forms_count, forms_summary_json, forms_detailed_json,
      ctas_json, cta_candidates_json, ctas_above_fold_json,
      has_tel_link, has_mailto_link, has_form,
      trust_signals_json, trust_extracted_json,
      nap_json, cities_json, jsonld_blocks_json, jsonld_extracted_json,
      text_snippet, content_text, content_outline_json, images_json,
      services_extracted_json, brand_assets_json, screenshots_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.audit_job_id,
    data.url,
    data.normalized_url,
    data.page_type || null,
    data.priority_score || 0,
    data.title || null,
    data.og_site_name || null,
    data.meta_description || null,
    data.canonical_url || null,
    data.h1_text || null,
    data.h2_json ? JSON.stringify(data.h2_json) : null,
    data.h3_json ? JSON.stringify(data.h3_json) : null,
    data.h6_json ? JSON.stringify(data.h6_json) : null,
    data.word_count || 0,
    data.nav_primary_json ? JSON.stringify(data.nav_primary_json) : null,
    data.footer_nav_links_json ? JSON.stringify(data.footer_nav_links_json) : null,
    data.internal_links_count || 0,
    data.outbound_links_count || 0,
    data.top_outbound_domains_json ? JSON.stringify(data.top_outbound_domains_json) : null,
    data.forms_count || 0,
    data.forms_summary_json ? JSON.stringify(data.forms_summary_json) : null,
    data.forms_detailed_json ? JSON.stringify(data.forms_detailed_json) : null,
    data.ctas_json ? JSON.stringify(data.ctas_json) : null,
    data.cta_candidates_json ? JSON.stringify(data.cta_candidates_json) : null,
    data.ctas_above_fold_json ? JSON.stringify(data.ctas_above_fold_json) : null,
    data.has_tel_link ? 1 : 0,
    data.has_mailto_link ? 1 : 0,
    data.has_form ? 1 : 0,
    data.trust_signals_json ? JSON.stringify(data.trust_signals_json) : null,
    data.trust_extracted_json ? JSON.stringify(data.trust_extracted_json) : null,
    data.nap_json ? JSON.stringify(data.nap_json) : null,
    data.cities_json ? JSON.stringify(data.cities_json) : null,
    data.jsonld_blocks_json ? JSON.stringify(data.jsonld_blocks_json) : null,
    data.jsonld_extracted_json ? JSON.stringify(data.jsonld_extracted_json) : null,
    data.text_snippet || null,
    data.content_text || null,
    data.content_outline_json ? JSON.stringify(data.content_outline_json) : null,
    data.images_json ? JSON.stringify(data.images_json) : null,
    data.services_extracted_json ? JSON.stringify(data.services_extracted_json) : null,
    data.brand_assets_json ? JSON.stringify(data.brand_assets_json) : null,
    data.screenshots_json ? JSON.stringify(data.screenshots_json) : null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function getCrawledPagesByJobId(jobId, callback) {
  const sql = `
    SELECT * FROM crawled_pages
    WHERE audit_job_id = ?
    ORDER BY priority_score DESC, id ASC
  `;

  db.all(sql, [jobId], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      const parsed = (rows || []).map(row => {
        // Parse JSON fields
        if (row.h2_json) row.h2_json = safeJsonParse(row.h2_json);
        if (row.h3_json) row.h3_json = safeJsonParse(row.h3_json);
        if (row.h6_json) row.h6_json = safeJsonParse(row.h6_json);
        if (row.nav_primary_json) row.nav_primary_json = safeJsonParse(row.nav_primary_json);
        if (row.footer_nav_links_json) row.footer_nav_links_json = safeJsonParse(row.footer_nav_links_json);
        if (row.top_outbound_domains_json) row.top_outbound_domains_json = safeJsonParse(row.top_outbound_domains_json);
        if (row.forms_summary_json) row.forms_summary_json = safeJsonParse(row.forms_summary_json);
        if (row.forms_detailed_json) row.forms_detailed_json = safeJsonParse(row.forms_detailed_json);
        if (row.ctas_json) row.ctas_json = safeJsonParse(row.ctas_json);
        if (row.cta_candidates_json) row.cta_candidates_json = safeJsonParse(row.cta_candidates_json);
        if (row.ctas_above_fold_json) row.ctas_above_fold_json = safeJsonParse(row.ctas_above_fold_json);
        if (row.trust_signals_json) row.trust_signals_json = safeJsonParse(row.trust_signals_json);
        if (row.trust_extracted_json) row.trust_extracted_json = safeJsonParse(row.trust_extracted_json);
        if (row.nap_json) row.nap_json = safeJsonParse(row.nap_json);
        if (row.cities_json) row.cities_json = safeJsonParse(row.cities_json);
        if (row.jsonld_blocks_json) row.jsonld_blocks_json = safeJsonParse(row.jsonld_blocks_json);
        if (row.jsonld_extracted_json) row.jsonld_extracted_json = safeJsonParse(row.jsonld_extracted_json);
        if (row.content_outline_json) row.content_outline_json = safeJsonParse(row.content_outline_json);
        if (row.images_json) row.images_json = safeJsonParse(row.images_json);
        if (row.services_extracted_json) row.services_extracted_json = safeJsonParse(row.services_extracted_json);
        if (row.brand_assets_json) row.brand_assets_json = safeJsonParse(row.brand_assets_json);
        if (row.screenshots_json) row.screenshots_json = safeJsonParse(row.screenshots_json);
        return row;
      });
      callback(null, parsed);
    }
  });
}

// Lighthouse Reports (Scraper v3)
function insertLighthouseReport(data, callback) {
  const sql = `
    INSERT INTO lighthouse_reports (
      audit_job_id, crawled_page_id, url, page_type,
      performance_score, accessibility_score, best_practices_score, seo_score,
      fcp, lcp, cls, tti, report_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.audit_job_id,
    data.crawled_page_id || null,
    data.url,
    data.page_type || null,
    data.performance_score || null,
    data.accessibility_score || null,
    data.best_practices_score || null,
    data.seo_score || null,
    data.fcp || null,
    data.lcp || null,
    data.cls || null,
    data.tti || null,
    data.report_json ? JSON.stringify(data.report_json) : null
  ];

  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function getLighthouseReportsByJobId(jobId, callback) {
  const sql = `
    SELECT * FROM lighthouse_reports
    WHERE audit_job_id = ?
    ORDER BY performance_score DESC
  `;

  db.all(sql, [jobId], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      const parsed = (rows || []).map(row => {
        if (row.report_json) row.report_json = safeJsonParse(row.report_json);
        return row;
      });
      callback(null, parsed);
    }
  });
}

// AI Assistants Management
function initializeDefaultAssistants() {
  // Load prompts from assistantPrompts module
  const { getAllAssistantPrompts } = require('./services/assistantPrompts');
  const prompts = getAllAssistantPrompts();
  
  // Zkontrolovat, jestli už asistenti existují
  db.get('SELECT COUNT(*) as count FROM ai_assistants', [], (err, row) => {
    if (err) {
      console.error('Error checking assistants:', err);
      return;
    }
    
    if (row.count === 0) {
      // Vložit výchozí asistenty - LLM Assistants v1 (6 assistants)
      const defaultAssistants = [
        {
          name: 'Evidence Normalizer',
          key: 'evidence_normalizer',
          model: 'openai/gpt-4.1',
          temperature: 0.10,
          requires_evidence_refs: 0,
          prompt: prompts.evidence_normalizer,
          sort_order: 1
        },
        {
          name: 'UX Conversion Auditor',
          key: 'ux_conversion_auditor',
          model: 'google/gemini-2.5-pro',
          temperature: 0.20,
          requires_evidence_refs: 1,
          prompt: prompts.ux_conversion_auditor,
          sort_order: 2
        },
        {
          name: 'Local SEO & GEO Auditor',
          key: 'local_seo_geo_auditor',
          model: 'openai/gpt-4.1',
          temperature: 0.15,
          requires_evidence_refs: 1,
          prompt: prompts.local_seo_geo_auditor,
          sort_order: 3
        },
        {
          name: 'Offer Strategist',
          key: 'offer_strategist',
          model: 'anthropic/claude-3.7-sonnet',
          temperature: 0.35,
          requires_evidence_refs: 0,
          prompt: prompts.offer_strategist,
          sort_order: 4
        },
        {
          name: 'Outreach Email Writer',
          key: 'outreach_email_writer',
          model: 'openai/gpt-4.1',
          temperature: 0.45,
          requires_evidence_refs: 0,
          prompt: prompts.outreach_email_writer,
          sort_order: 5
        },
        {
          name: 'Public Audit Page Composer',
          key: 'public_audit_page_composer',
          model: 'google/gemini-2.5-pro',
          temperature: 0.25,
          requires_evidence_refs: 0,
          prompt: prompts.public_audit_page_composer,
          sort_order: 6
        }
      ];

      defaultAssistants.forEach(assistant => {
        const sql = `
          INSERT INTO ai_assistants (name, key, model, temperature, prompt, sort_order, requires_evidence_refs)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
          assistant.name,
          assistant.key,
          assistant.model,
          assistant.temperature,
          assistant.prompt,
          assistant.sort_order,
          assistant.requires_evidence_refs || 0
        ], (insertErr) => {
          if (insertErr) {
            console.error(`Error inserting assistant ${assistant.name}:`, insertErr);
          } else {
            console.log(`Default assistant ${assistant.name} created (requires_evidence_refs: ${assistant.requires_evidence_refs || 0})`);
          }
        });
      });
    } else {
      console.log(`AI assistants already exist (${row.count} found)`);
      // Keep DB prompts in sync with code prompts so new runs use latest rules
      // (No fallbacks / evidence-first / fix_steps schema, etc.)
      db.all('SELECT id, key, prompt FROM ai_assistants WHERE is_active = 1', [], (selErr, rows2) => {
        if (selErr) {
          console.error('Error loading assistants for prompt sync:', selErr);
          return;
        }
        const byKey = {};
        (rows2 || []).forEach((r) => { byKey[r.key] = r; });
        const entries = Object.entries(prompts || {});
        let updatedCount = 0;
        entries.forEach(([key, prompt]) => {
          if (!key || !prompt) return;
          const existing = byKey[key];
          if (!existing) return;
          if ((existing.prompt || '').trim() === String(prompt).trim()) return;
          db.run('UPDATE ai_assistants SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [String(prompt), key], (updErr) => {
            if (updErr) {
              console.error(`Error syncing prompt for assistant ${key}:`, updErr);
            } else {
              updatedCount += 1;
              console.log(`Synced prompt for assistant ${key}`);
            }
          });
        });
        if (entries.length > 0) {
          console.log(`Assistant prompt sync scheduled (${entries.length} keys checked)`);
        }
      });
    }
  });
}

function getAllAssistants(callback) {
  const sql = `
    SELECT * FROM ai_assistants
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows || []);
    }
  });
}

function getAssistantById(id, callback) {
  const sql = `SELECT * FROM ai_assistants WHERE id = ?`;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, row);
    }
  });
}

function getAssistantByKey(key, callback) {
  const sql = `SELECT * FROM ai_assistants WHERE key = ? AND is_active = 1`;
  
  db.get(sql, [key], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, row);
    }
  });
}

function createAssistant(data, callback) {
  const sql = `
    INSERT INTO ai_assistants (name, key, model, temperature, prompt, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    data.name,
    data.key,
    data.model || 'openai/gpt-4.1-mini',
    data.temperature || 0.3,
    data.prompt,
    data.sort_order || 999
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function updateAssistant(id, data, callback) {
  const sql = `
    UPDATE ai_assistants
    SET name = ?, key = ?, model = ?, temperature = ?, prompt = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  const params = [
    data.name,
    data.key,
    data.model,
    data.temperature,
    data.prompt,
    data.sort_order,
    id
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { changes: this.changes });
    }
  });
}

function deleteAssistant(id, callback) {
  // Soft delete - nastavit is_active na 0
  const sql = `UPDATE ai_assistants SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  
  db.run(sql, [id], function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { changes: this.changes });
    }
  });
}

// Assistant Runs Management (LLM Assistants v1)
function insertAssistantRun(data, callback) {
  const sql = `
    INSERT INTO assistant_runs (
      job_id, assistant_key, model, temperature, prompt_template_id,
      request_payload_json, response_text, response_json, status, error,
      started_at, finished_at, token_usage_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    data.job_id,
    data.assistant_key,
    data.model,
    data.temperature,
    data.prompt_template_id || null,
    data.request_payload_json ? JSON.stringify(data.request_payload_json) : null,
    data.response_text || null,
    data.response_json ? JSON.stringify(data.response_json) : null,
    data.status || 'queued',
    data.error || null,
    data.started_at || new Date().toISOString(),
    data.finished_at || null,
    data.token_usage_json ? JSON.stringify(data.token_usage_json) : null
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function updateAssistantRun(id, updates, callback) {
  const allowedFields = ['status', 'error', 'request_payload_json', 'response_text', 'response_json', 'finished_at', 'token_usage_json'];
  const keys = Object.keys(updates || {}).filter((key) => allowedFields.includes(key));
  
  if (keys.length === 0) {
    return callback(new Error('No valid fields to update'), null);
  }
  
  const setClauses = keys.map((key) => `${key} = ?`).join(', ');
  const params = keys.map((key) => {
    const value = updates[key];
    // Handle JSON fields
    if (typeof value === 'object' && value !== null && (key.includes('_json') || key === 'token_usage_json')) {
      return JSON.stringify(value);
    }
    return value;
  });
  params.push(id);
  
  const sql = `
    UPDATE assistant_runs
    SET ${setClauses}
    WHERE id = ?
  `;
  
  db.run(sql, params, function(err) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, { changes: this.changes });
    }
  });
}

function getAssistantRunsByJobId(jobId, callback) {
  const sql = `
    SELECT 
      ar.*,
      aa.name as assistant_name,
      aa.model as assistant_current_model,
      aa.temperature as assistant_current_temp,
      aa.prompt as assistant_current_prompt,
      aa.sort_order as assistant_sort_order
    FROM assistant_runs ar
    LEFT JOIN ai_assistants aa ON ar.assistant_key = aa.key
    WHERE ar.job_id = ?
    ORDER BY aa.sort_order ASC, ar.started_at ASC
  `;
  
  db.all(sql, [jobId], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      const parsed = (rows || []).map(row => {
        if (row.request_payload_json) row.request_payload_json = safeJsonParse(row.request_payload_json);
        if (row.response_json) row.response_json = safeJsonParse(row.response_json);
        if (row.token_usage_json) row.token_usage_json = safeJsonParse(row.token_usage_json);
        return row;
      });
      callback(null, parsed);
    }
  });
}

function getAssistantRunById(id, callback) {
  const sql = `SELECT * FROM assistant_runs WHERE id = ?`;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      if (row) {
        if (row.request_payload_json) row.request_payload_json = safeJsonParse(row.request_payload_json);
        if (row.response_json) row.response_json = safeJsonParse(row.response_json);
        if (row.token_usage_json) row.token_usage_json = safeJsonParse(row.token_usage_json);
      }
      callback(null, row);
    }
  });
}

module.exports = {
  db,
  insertSubmission,
  getAllSubmissions,
  getSubmissionById,
  deleteSubmission,
  insertWebProjectSubmission,
  getAllWebProjectSubmissions,
  getWebProjectSubmissionById,
  deleteWebProjectSubmission,
  createAuditJob,
  getAuditJobs,
  getAuditJobById,
  getAuditJobBySlug,
  updateAuditJob,
  deleteAuditJob,
  getAuditJobByUrl,
  appendAuditRunLog,
  getAuditRunLogs,
  getActivePromptTemplates,
  createPromptTemplateVersion,
  createNichePreset,
  getAllNichePresets,
  getNichePresetById,
  getNichePresetBySlug,
  updateNichePreset,
  deleteNichePreset,
  insertCrawledPage,
  getCrawledPagesByJobId,
  insertLighthouseReport,
  getLighthouseReportsByJobId,
  getAllAssistants,
  getAssistantById,
  getAssistantByKey,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  insertAssistantRun,
  updateAssistantRun,
  getAssistantRunsByJobId,
  getAssistantRunById,
  getSiteSetting,
  getAllSiteSettings,
  setSiteSetting
};

// Site Settings functions
function getSiteSetting(key, callback) {
  const sql = 'SELECT value FROM site_settings WHERE key = ?';
  db.get(sql, [key], (err, row) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, row ? row.value : null);
    }
  });
}

function getAllSiteSettings(callback) {
  const sql = 'SELECT key, value, updated_at FROM site_settings ORDER BY key';
  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, rows);
    }
  });
}

function setSiteSetting(key, value, callback) {
  const sql = `
    INSERT INTO site_settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `;
  db.run(sql, [key, value, value], function(err) {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
}