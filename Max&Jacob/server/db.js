const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Vytvoření/připojení k databázi
// Pro produkci použijeme persistent disk nebo vytvoříme databázi v aktuálním adresáři
const dbPath = path.join(__dirname, '..', 'data.db');
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
    db.run('PRAGMA journal_mode=WAL;', (pragmaErr) => {
      if (pragmaErr) {
        console.error('Error setting WAL mode:', pragmaErr);
      } else {
        console.log('Database WAL mode enabled');
      }
      initDatabase();
    });
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
      email, name, company, website, zip_code, needs_help_with, 
      industry, budget_range, timeline, message, 
      has_attachment, ip_address, selected_package
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.email,
    data.name || null,
    data.company || null,
    data.website || null,
    data.zip_code || null,
    typeof data.needs_help_with === 'object' ? JSON.stringify(data.needs_help_with) : data.needs_help_with,
    data.industry || null,
    data.budget_range,
    data.timeline || null,
    data.message,
    data.has_attachment ? 1 : 0,
    data.ip_address || null,
    data.selected_package || null
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
          // Pokud to není validní JSON, necháme jako string
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

module.exports = {
  db,
  insertSubmission,
  getAllSubmissions,
  getSubmissionById,
  insertWebProjectSubmission,
  getAllWebProjectSubmissions,
  getWebProjectSubmissionById
};

