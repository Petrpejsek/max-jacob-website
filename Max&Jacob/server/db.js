const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Vytvoření/připojení k databázi
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
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
      console.error('Error creating table:', err);
    } else {
      console.log('Table contact_submissions ready');
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

module.exports = {
  db,
  insertSubmission,
  getAllSubmissions,
  getSubmissionById
};

