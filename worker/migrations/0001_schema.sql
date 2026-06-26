-- ═══════════════════════════════════════════════════════════
--  CompeteInChina — D1 Database Schema & Seed Data
--  迁移自 init-db.js (SQLite → Cloudflare D1)
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Users ────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 2. Registrations ───────────────────────────
CREATE TABLE IF NOT EXISTS registrations (
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
);

-- ─── 3. Concierge Applications ──────────────────
CREATE TABLE IF NOT EXISTS concierge_applications (
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
);

-- ─── 4. Competitions ────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
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
);

-- ─── 5. Site Config (Key-Value CMS) ─────────────
CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 6. Competition Tracking ────────────────────
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
);

-- ─── 7. Agreement Signatures ────────────────────
CREATE TABLE IF NOT EXISTS agreement_signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    agreement_type TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    UNIQUE(user_id, agreement_type)
);

-- ─── 8. Organizer Submissions ───────────────────
CREATE TABLE IF NOT EXISTS organizer_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comp_name TEXT NOT NULL,
    city TEXT,
    prize TEXT,
    deadline TEXT,
    industry TEXT,
    website TEXT,
    description TEXT,
    contact_name TEXT,
    contact_email TEXT,
    phone TEXT,
    wechat TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 9. Verification Codes ──────────────────────
CREATE TABLE IF NOT EXISTS verify_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

-- ─── Indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(contact_email);
CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_competitions_city ON competitions(city);
CREATE INDEX IF NOT EXISTS idx_tracking_user ON competition_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_comp ON competition_tracking(competition_id);
CREATE INDEX IF NOT EXISTS idx_tracking_stage ON competition_tracking(current_stage);

-- ═══════════════════════════════════════════════════════════
--  SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Admin user (password: CompeteInChina2026!)
-- SHA-256 hash of "CompeteInChina2026!"
INSERT OR IGNORE INTO users (email, password_hash, full_name, role)
VALUES ('admin@competeinchina.com', 'a2c9e853601479aa6bf3bdf4d4a798dff164ad9ebee10686499bdc7cc063711c', 'System Administrator', 'admin');

-- Site config defaults
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('hero_title', 'Compete in China. Grow with China.', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('hero_subtitle', 'Discover 200+ innovation competitions across 20+ Chinese cities. Your gateway to China''s startup ecosystem.', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('stat_competitions', '200+', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('stat_cities', '20+', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('stat_startups', '5,000+', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('stat_prize_pool', '$50M+', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('announcement_text', '', 'text');
INSERT OR IGNORE INTO site_config (key, value, type) VALUES ('announcement_active', '0', 'boolean');
