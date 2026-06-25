// ═══════════════════════════════════════════════════════════
//  CompeteInChina — Competition Tracking Migration Script
//  Run once: node migrate-tracking.js
//  Adds the competition_tracking table to an existing database
// ═══════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'competeinchina.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log('🔧 Running tracking migration on:', DB_PATH);

// Create table if not exists
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
console.log('  ✓ competition_tracking table ready');

// Create indexes
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tracking_user ON competition_tracking(user_id)'); console.log('  ✓ idx_tracking_user'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tracking_comp ON competition_tracking(competition_id)'); console.log('  ✓ idx_tracking_comp'); } catch(e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tracking_stage ON competition_tracking(current_stage)'); console.log('  ✓ idx_tracking_stage'); } catch(e) {}

const count = db.prepare('SELECT COUNT(*) as c FROM competition_tracking').get().c;
console.log('  ✓ Existing tracking records: ' + count);

db.close();
console.log('\n🎉 Migration complete!');
