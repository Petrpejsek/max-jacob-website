const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { db } = require('../db');
const { getRepoRoot, getPersistentPublicDir, getSqliteDbPath } = require('../runtimePaths');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function sqlGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function sqlAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function canWriteDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.diag-write-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getDbTableInfo(table) {
  try {
    const rows = await sqlAll(`PRAGMA table_info(${table})`);
    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      notnull: r.notnull,
      dflt_value: r.dflt_value,
      pk: r.pk
    }));
  } catch (e) {
    return { error: e.message };
  }
}

async function getCount(table) {
  try {
    const row = await sqlGet(`SELECT COUNT(*) as count FROM ${table}`);
    return row ? row.count : 0;
  } catch (e) {
    return null;
  }
}

async function getAssistantsSummary() {
  try {
    const rows = await sqlAll(
      'SELECT id, key, name, model, temperature, is_active, sort_order, requires_evidence_refs, prompt FROM ai_assistants ORDER BY sort_order ASC, id ASC'
    );

    const badRefs = rows
      .filter((r) => (r.prompt || '').includes('job.city'))
      .map((r) => r.key);

    const assistants = rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      model: r.model,
      temperature: r.temperature,
      is_active: r.is_active,
      sort_order: r.sort_order,
      requires_evidence_refs: r.requires_evidence_refs,
      prompt_length: (r.prompt || '').length,
      prompt_sha256: sha256(r.prompt || '')
    }));

    return {
      count_total: rows.length,
      count_active: rows.filter((r) => Number(r.is_active) === 1).length,
      bad_job_city_refs: badRefs,
      assistants
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function getPromptTemplatesSummary() {
  try {
    const rows = await sqlAll(
      'SELECT name, version, is_active, LENGTH(content) as content_length FROM prompt_templates ORDER BY name ASC, version DESC'
    );
    return {
      count_total: rows.length,
      active: rows.filter((r) => Number(r.is_active) === 1).map((r) => ({
        name: r.name,
        version: r.version,
        content_length: r.content_length
      }))
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function getPlaywrightDiagnostics() {
  const info = {
    node_env: process.env.NODE_ENV || null,
    playwright_browsers_path: process.env.PLAYWRIGHT_BROWSERS_PATH || null
  };

  try {
    // Lazy require to avoid crashing if dependency missing
    const { chromium } = require('playwright');
    const exe = typeof chromium.executablePath === 'function' ? chromium.executablePath() : null;
    info.chromium_executable_path = exe;
    info.chromium_executable_exists = exe ? fs.existsSync(exe) : null;
  } catch (e) {
    info.error = e.message;
  }

  return info;
}

async function collectDiagnostics() {
  const repoRoot = getRepoRoot();
  const publicDir = getPersistentPublicDir();
  const dbPath = getSqliteDbPath();

  const env = {
    NODE_ENV: process.env.NODE_ENV || null,
    APP_URL: process.env.APP_URL || null,
    USE_SCRAPER_V3: process.env.USE_SCRAPER_V3 || null,
    DB_PATH: process.env.DB_PATH || null,
    PUBLIC_DIR: process.env.PUBLIC_DIR || null,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || null,
    RENDER_GIT_COMMIT: process.env.RENDER_GIT_COMMIT || null,
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || null
  };

  const tables = {
    audit_jobs: await getCount('audit_jobs'),
    niche_presets: await getCount('niche_presets'),
    prompt_templates: await getCount('prompt_templates'),
    ai_assistants: await getCount('ai_assistants'),
    assistant_runs: await getCount('assistant_runs'),
    crawled_pages: await getCount('crawled_pages')
  };

  const schema = {
    audit_jobs: await getDbTableInfo('audit_jobs'),
    ai_assistants: await getDbTableInfo('ai_assistants'),
    prompt_templates: await getDbTableInfo('prompt_templates')
  };

  return {
    generated_at: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      pid: process.pid
    },
    paths: {
      repo_root: repoRoot,
      persistent_public_dir: publicDir,
      sqlite_db_path: dbPath,
      persistent_public_writable: canWriteDir(publicDir),
      db_dir_writable: canWriteDir(path.dirname(dbPath))
    },
    env,
    db: {
      tables,
      schema,
      assistants: await getAssistantsSummary(),
      prompt_templates: await getPromptTemplatesSummary()
    },
    playwright: await getPlaywrightDiagnostics()
  };
}

module.exports = {
  collectDiagnostics
};

