// ═══════════════════════════════════════════════════════════
//  CompeteInChina — Database Initialization Script
//  Run once: node init-db.js
// ═══════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'db', 'competeinchina.db');
const COMPETITIONS_JSON = path.join(__dirname, 'competitions.json');

console.log('🔧 Initializing database at:', DB_PATH);

// Remove existing database for clean init
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('  ✗ Removed existing database');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('✓ Connected to SQLite');

// ─── 1. Users Table ──────────────────────────────
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  ✓ Created: users');

// ─── 2. Registrations Table ─────────────────────
db.exec(`
  CREATE TABLE registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    country TEXT,
    team_size TEXT,
    stage TEXT,
    oneliner TEXT,
    contact_name TEXT NOT NULL,
    contact_role TEXT,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    contact_linkedin TEXT,
    contact_wechat TEXT,
    passport TEXT,
    industry TEXT,
    keywords TEXT,
    product_desc TEXT,
    business_model TEXT,
    funded TEXT,
    funding_round TEXT,
    funding_amount TEXT,
    investors TEXT,
    ip TEXT,
    cn_funding TEXT,
    cn_cities TEXT,
    register_cn TEXT,
    cn_setup TEXT,
    roadmap TEXT,
    support_needed TEXT,
    team_members TEXT,
    team_stability TEXT,
    resume TEXT,
    website TEXT,
    auth_agree INTEGER DEFAULT 0,
    pitch_deck TEXT,
    extra_links TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    competition_ids TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
console.log('  ✓ Created: registrations');

// ─── 3. Concierge Applications Table ────────────
db.exec(`
  CREATE TABLE concierge_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    industry TEXT,
    target_competitions TEXT,
    timeline TEXT,
    budget_range TEXT,
    special_requirements TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);
console.log('  ✓ Created: concierge_applications');

// ─── 4. Competitions Table ──────────────────────
db.exec(`
  CREATE TABLE competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    city TEXT NOT NULL,
    deadline TEXT,
    prize TEXT,
    prize_category TEXT,
    industries TEXT,
    level TEXT,
    desc TEXT,
    highlights TEXT,
    apply_url TEXT,
    english_url TEXT,
    stage TEXT DEFAULT 'Registration',
    title_cn TEXT,
    featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  ✓ Created: competitions');

// ─── 5. Site Config Table (Key-Value CMS) ───────
db.exec(`
  CREATE TABLE site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('  ✓ Created: site_config');

// ─── 6. Competition Tracking Table ──────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS competition_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_name TEXT NOT NULL,
    competition_id INTEGER,
    current_stage TEXT NOT NULL DEFAULT 'registering',
    stage_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
  )
`);
console.log('  ✓ Created: competition_tracking');

// ─── Insert Seed Data ───────────────────────────

// Site config defaults
const defaultConfigs = [
  ['hero_title', 'Compete in China. Grow with China.', 'text'],
  ['hero_subtitle', 'Discover 200+ innovation competitions across 20+ Chinese cities. Your gateway to China\'s startup ecosystem.', 'text'],
  ['stat_competitions', '200+', 'text'],
  ['stat_cities', '20+', 'text'],
  ['stat_startups', '5,000+', 'text'],
  ['stat_prize_pool', '$50M+', 'text'],
  ['announcement_text', '', 'text'],
  ['announcement_active', '0', 'boolean'],
];
const insertConfig = db.prepare('INSERT OR IGNORE INTO site_config (key, value, type) VALUES (?, ?, ?)');
defaultConfigs.forEach(([key, val, type]) => {
  insertConfig.run(key, val, type);
});
console.log('  ✓ Seeded: site_config defaults');

// Competitions from JSON
if (fs.existsSync(COMPETITIONS_JSON)) {
  const competitions = JSON.parse(fs.readFileSync(COMPETITIONS_JSON, 'utf-8'));
  const insertComp = db.prepare(`
    INSERT INTO competitions (title, city, deadline, prize, prize_category, industries, level, desc, highlights, apply_url, english_url, stage, title_cn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of competitions) {
    insertComp.run(
      c.title, c.city, c.deadline, c.prize, c.prizeCategory,
      JSON.stringify(c.industries), c.level, c.desc,
      JSON.stringify(c.highlights), c.applyUrl, c.englishUrl || '',
      c.stage, c.titleCN || ''
    );
  }
  console.log(`  ✓ Seeded: ${competitions.length} competitions from competitions.json`);
} else {
  console.log('  ⚠ competitions.json not found, skipping seed data');
}

// Create admin user (password: CompeteInChina2026!)
const crypto = require('crypto');
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

db.exec(`
  INSERT OR IGNORE INTO users (email, password_hash, full_name, role)
  VALUES ('admin@competeinchina.com', '${hashPassword('CompeteInChina2026!')}', 'Admin', 'admin')
`);
console.log('  ✓ Seeded: admin user (admin@competeinchina.com)');

// ─── Indexes ────────────────────────────────────
db.exec(`CREATE INDEX idx_registrations_email ON registrations(contact_email)`);
db.exec(`CREATE INDEX idx_registrations_user ON registrations(user_id)`);
db.exec(`CREATE INDEX idx_users_email ON users(email)`);
db.exec(`CREATE INDEX idx_competitions_city ON competitions(city)`);
db.exec(`CREATE INDEX idx_tracking_user ON competition_tracking(user_id)`);
db.exec(`CREATE INDEX idx_tracking_comp ON competition_tracking(competition_id)`);
db.exec(`CREATE INDEX idx_tracking_stage ON competition_tracking(current_stage)`);
console.log('  ✓ Created indexes');

// ─── Done! ──────────────────────────────────────
db.close();
console.log('\n🎉 Database initialized successfully!');
console.log(`   File: ${DB_PATH}`);
console.log(`   Tables: users, registrations, concierge_applications, competitions, site_config`);
console.log('\n   Run: node server.js   to start the server.');
