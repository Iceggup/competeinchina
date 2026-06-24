// ═══════════════════════════════════════════════════════════
//  CompeteInChina — Server (Express + SQLite + Resend)
//  Port: 3300 | Start: node server.js
// ═══════════════════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const crypto = require('crypto');
const path = require('path');

// ─── App Setup ──────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3300;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve static files from project root
app.use(express.static(path.join(__dirname)));

// ─── Database ───────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'competeinchina.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

console.log(`[DB] Connected: ${DB_PATH}`);

// ─── Resend Email Client ───────────────────────
let resendClient;
try {
  resendClient = new Resend(process.env.RESEND_API_KEY || 're_dw1bVA9M_9z2T2hoN5h82W1UnScaF77r6');
} catch (e) {
  console.warn('[Email] Resend init failed:', e.message);
}

// ─── In-Memory Verification Codes ───────────────
// In production, use Redis; for now Map is fine (single server)
const verificationCodes = new Map();
// { email: { code: "123456", expiresAt: timestamp } }

// Cleanup expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
}, 5 * 60 * 1000);

// ─── JWT Helpers ────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'competeinchina_jwt_secret_key_2026';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// Optional auth — doesn't fail, just attaches user if present
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (e) { /* ignore */ }
  }
  next();
}

// ─── Password Hash ──────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ─── Health Check ───────────────────────────────
app.get('/api/health', (req, res) => {
  let dbStatus = 'ok';
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    db.close();
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }
  res.json({
    success: true,
    status: 'running',
    port: PORT,
    database: dbStatus,
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

// ════════════════════════════════════════════════════
//  VERIFICATION CODE APIs
// ════════════════════════════════════════════════════

// POST /api/send-verify-code — Send email with 6-digit code
app.post('/api/send-verify-code', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit: max 5 codes per email per hour
    const existing = verificationCodes.get(normalizedEmail);
    if (existing && (Date.now() - existing.createdAt) < 60000) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 60 seconds before requesting another code.'
      });
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in memory
    verificationCodes.set(normalizedEmail, { code, expiresAt, createdAt: Date.now() });

    // Send email via Resend
    try {
      const emailFrom = process.env.EMAIL_FROM || 'noreply@competeinchina.com';

      await resendClient.emails.send({
        from: `CompeteInChina <${emailFrom}>`,
        to: normalizedEmail,
        subject: 'Your Verification Code — CompeteInChina',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#2563eb;color:white;padding:16px 24px;border-radius:8px 8px 0 0;margin-bottom:0;">
              <h2 style="margin:0;font-size:20px;">CompeteInChina</h2>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
              <p style="font-size:15px;color:#334155;margin-bottom:16px;">
                Your verification code is:
              </p>
              <div style="background:#eff6ff;border:2px solid #2563eb;padding:20px;text-align:center;border-radius:10px;margin:20px 0;">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#2563eb;">${code}</span>
              </div>
              <p style="font-size:13px;color:#94a3b8;line-height:1.6;">
                This code expires in <strong>10 minutes</strong>.<br>
                If you didn't request this code, please ignore this email.
              </p>
            </div>
            <div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">
              TechinBridge · CompeteInChina
            </div>
          </div>
        `
      });

      console.log(`[Email] Verification code sent to ${normalizedEmail}: ${code.substring(0,3)}***`);

      // ✅ Success — do NOT return the code!
      return res.json({
        success: true,
        message: 'Verification code sent! Please check your inbox.'
      });

    } catch (emailError) {
      console.error('[Email] Resend failed:', emailError);

      // ❌ CRITICAL FIX: Do NOT fallback to local code generation
      // Remove the stored code so user can't use it without receiving email
      verificationCodes.delete(normalizedEmail);

      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please check your email address and try again.',
        error: emailError.message
      });
    }

  } catch (error) {
    console.error('[send-verify-code] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

// POST /api/verify-code — Check if entered code is correct
app.post('/api/verify-code', (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and code are required.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = verificationCodes.get(normalizedEmail);

    if (!record) {
      return res.json({
        success: false,
        message: 'No verification code found. Please request a new one.'
      });
    }

    if (Date.now() > record.expiresAt) {
      verificationCodes.delete(normalizedEmail);
      return res.json({
        success: false,
        message: 'This code has expired. Please request a new one.'
      });
    }

    if (record.code !== code.trim()) {
      return res.json({
        success: false,
        message: 'Incorrect verification code. Please check and try again.'
      });
    }

    // ✓ Verified! Delete the code (single-use)
    verificationCodes.delete(normalizedEmail);

    return res.json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (error) {
    console.error('[verify-code] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while verifying your code.'
    });
  }
});

// ════════════════════════════════════════════════════
//  USER AUTHENTICATION APIs
// ════════════════════════════════════════════════════

// POST /api/users/register — Register new user
app.post('/api/users/register', (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();

    // Check if already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      db.close();
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please log in instead.'
      });
    }

    // Create user
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (?, ?, ?, 'user')
    `).run(normalizedEmail, hashPassword(password), full_name || '');

    const user = {
      id: result.lastInsertRowid,
      email: normalizedEmail,
      full_name: full_name || '',
      role: 'user'
    };

    const token = generateToken(user);
    db.close();

    console.log(`[Auth] User registered: ${normalizedEmail} (#${user.id})`);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user
    });

  } catch (error) {
    console.error('[register] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// POST /api/users/login — Login existing user
app.post('/api/users/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const db = getDb();
    const user = db.prepare(`
      SELECT id, email, full_name, role FROM users WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (!user) {
      db.close();
      return res.status(401).json({
        success: false,
        message: 'Incorrect email or password.'
      });
    }

    // Verify password
    const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (stored.password_hash !== hashPassword(password)) {
      db.close();
      return res.status(401).json({
        success: false,
        message: 'Incorrect email or password.'
      });
    }

    const token = generateToken(user);
    db.close();

    console.log(`[Auth] User logged in: ${user.email} (#${user.id})`);

    return res.json({
      success: true,
      message: 'Login successful!',
      token,
      user
    });

  } catch (error) {
    console.error('[login] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// GET /api/users/me — Get current user info
app.get('/api/users/me', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT id, email, full_name, role, created_at
      FROM users WHERE id = ?
    `).get(req.user.userId);
    db.close();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, user });

  } catch (error) {
    console.error('[users/me] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
});

// ════════════════════════════════════════════════════
//  REGISTRATION SUBMISSION API
// ════════════════════════════════════════════════════

// POST /api/registrations — Submit registration form
app.post('/api/registrations', verifyToken, (req, res) => {
  try {
    const data = req.body;

    // Require at minimum these fields
    if (!data.team_name || !data.contact_email) {
      return res.status(400).json({
        success: false,
        message: 'Team name and contact email are required.'
      });
    }

    const db = getDb();

    // Check for duplicate by email
    const duplicate = db.prepare(
      `SELECT id FROM registrations WHERE contact_email = ?`
    ).get(data.contact_email.toLowerCase());

    if (duplicate) {
      db.close();
      return res.status(409).json({
        success: false,
        message: 'You have already submitted a registration with this email.'
      });
    }

    const result = db.prepare(`
      INSERT INTO registrations (
        user_id, team_name, country, team_size, stage, oneliner,
        contact_name, contact_role, contact_email, contact_phone,
        contact_linkedin, contact_wechat, industry, keywords,
        product_desc, business_model, funded, funding_round,
        funding_amount, investors, ip, cn_funding, cn_cities,
        register_cn, cn_setup, roadmap, support_needed,
        team_members, team_stability, auth_agree, pitch_deck,
        extra_links, notes, competition_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.userId, data.team_name, data.country || '', data.team_size || '',
      data.stage || '', data.oneliner || '', data.contact_name || '',
      data.contact_role || '', data.contact_email.toLowerCase(), data.contact_phone || '',
      data.contact_linkedin || '', data.contact_wechat || '',
      Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || ''),
      data.keywords || '', data.product_desc || '', data.business_model || '',
      Array.isArray(data.funded) ? data.funded.join(', ') : (data.funded || ''),
      data.funding_round || '', data.funding_amount || '', data.investors || '',
      data.ip || '', data.cn_funding || '', data.cn_cities || '',
      Array.isArray(data.register_cn) ? data.register_cn.join(', ') : (data.register_cn || ''),
      data.cn_setup || '', data.roadmap || '',
      Array.isArray(data.support_needed) ? data.support_needed.join(', ') : (data.support_needed || ''),
      data.team_members || '', data.team_stability || '',
      data.auth_agree ? 1 : 0, data.pitch_deck || '',
      data.extra_links || '', data.notes || '',
      Array.isArray(data.competition_ids) ? data.competition_ids.join(', ') : (data.competition_ids || '')
    );

    db.close();

    console.log(`[Reg] Registration submitted #${result.lastInsertRowid} by user#${req.user.userId}`);

    return res.status(201).json({
      success: true,
      message: 'Registration submitted successfully! We will review and get back to you within 48 hours.',
      registrationId: result.lastInsertRowid
    });

  } catch (error) {
    console.error('[registration] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Submission failed. Please try again.'
    });
  }
});

// GET /api/registrations — List all registrations (admin)
app.get('/api/registrations', verifyToken, (req, res) => {
  try {
    // Only admin can list all
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const db = getDb();
    const regs = db.prepare(`
      SELECT r.*, u.full_name as user_full_name
      FROM registrations r LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.submitted_at DESC
    `).all();
    db.close();

    res.json({ success: true, registrations: regs });

  } catch (error) {
    console.error('[registrations/list] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load registrations.' });
  }
});

// PATCH /api/registrations/:id/status — Update status (admin)
app.patch('/api/registrations/:id/status', verifyToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const { status } = req.body;
    const allowedStatuses = ['pending', 'reviewed', 'approved', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const db = getDb();
    db.prepare('UPDATE registrations SET status = ? WHERE id = ?').run(status, req.params.id);
    db.close();

    res.json({ success: true, message: `Status updated to ${status}.` });

  } catch (error) {
    console.error('[reg/status] Error:', error);
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
});

// ════════════════════════════════════════════════════
//  CONCIERGE APPLICATION API
// ════════════════════════════════════════════════════

app.post('/api/concierge', optionalAuth, (req, res) => {
  try {
    const data = req.body;

    if (!data.company_name || !data.contact_person || !data.email) {
      return res.status(400).json({
        success: false,
        message: 'Company name, contact person, and email are required.'
      });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO concierge_applications (
        user_id, company_name, contact_person, email, phone, whatsapp,
        industry, target_competitions, timeline, budget_range,
        special_requirements, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      req.user?.userId || null, data.company_name, data.contact_person,
      data.email.toLowerCase(), data.phone || '', data.whatsapp || '',
      Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || ''),
      Array.isArray(data.target_competitions) ? data.target_competitions.join(', ') : (data.target_competitions || ''),
      data.timeline || '', data.budget_range || '',
      data.special_requirements || '', data.notes || ''
    );
    db.close();

    console.log(`[Concierge] Application submitted #${result.lastInsertRowid}`);

    return res.status(201).json({
      success: true,
      message: 'Concierge request received! We will contact you within 24 hours.',
      applicationId: result.lastInsertRowid
    });

  } catch (error) {
    console.error('[concierge] Error:', error);
    res.status(500).json({ success: false, message: 'Submission failed.' });
  }
});

app.get('/api/concierge', verifyToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const db = getDb();
    const apps = db.prepare(`
      SELECT * FROM concierge_applications ORDER BY created_at DESC
    `).all();
    db.close();

    res.json({ success: true, applications: apps });
  } catch (error) {
    console.error('[concierge/list] Error:', error);
    res.status(500).json({ success: false, message: 'Load failed.' });
  }
});

// ════════════════════════════════════════════════════
//  COMPETITIONS API
// ════════════════════════════════════════════════════

app.get('/api/competitions', (req, res) => {
  try {
    const db = getDb();

    let query = `SELECT * FROM competitions ORDER BY sort_order ASC, id ASC`;
    const params = [];

    // Filter by city
    if (req.query.city) {
      query = `SELECT * FROM competitions WHERE city = ? ORDER BY sort_order ASC, id ASC`;
      params.push(req.query.city);
    }

    // Filter by featured only
    if (req.query.featured === 'true') {
      query = `SELECT * FROM competitions WHERE featured = 1 ORDER BY sort_order ASC, id ASC`;
    }

    const comps = db.prepare(query).all(...params);
    db.close();

    // Parse JSON fields for each competition
    const results = comps.map(c => ({
      ...c,
      industries: typeof c.industries === 'string' ? JSON.parse(c.industries || '[]') : c.industries,
      highlights: typeof c.highlights === 'string' ? JSON.parse(c.highlights || '[]') : c.highlights
    }));

    res.json({ success: true, competitions: results });
  } catch (error) {
    console.error('[competitions] Error:', error);
    res.status(500).json({ success: false, message: 'Load failed.' });
  }
});

app.get('/api/competitions/:id', (req, res) => {
  try {
    const db = getDb();
    const comp = db.prepare('SELECT * FROM competitions WHERE id = ?').get(req.params.id);
    db.close();

    if (!comp) {
      return res.status(404).json({ success: false, message: 'Competition not found.' });
    }

    comp.industries = JSON.parse(comp.industries || '[]');
    comp.highlights = JSON.parse(comp.highlights || '[]');

    res.json({ success: true, competition: comp });
  } catch (error) {
    console.error('[competition/id] Error:', error);
    res.status(500).json({ success: false, message: 'Load failed.' });
  }
});

// ─── Admin: CRUD Competitions ────────────────────

app.post('/api/admin/competitions', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const d = req.body;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO competitions (title, city, deadline, prize, prize_category, industries,
        level, desc, highlights, apply_url, english_url, stage, title_cn, featured, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.title, d.city, d.deadline || '', d.prize || '', d.prize_category || '',
      JSON.stringify(d.industries || []), d.level || '', d.desc || '',
      JSON.stringify(d.highlights || []), d.apply_url || '', d.english_url || '',
      d.stage || 'Registration', d.title_cn || '', d.featured ? 1 : 0, d.sort_order || 0);
    db.close();
    res.status(201).json({ success: true, id: result.lastInsertRowid, message: 'Competition added.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.put('/api/admin/competitions/:id', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const d = req.body;
    const db = getDb();
    db.prepare(`
      UPDATE competitions SET title=?, city=?, deadline=?, prize=?, prize_category=?,
        industries=?, level=?, desc=?, highlights=?, apply_url=?, english_url=?,
        stage=?, title_cn=?, featured=?, sort_order=?
      WHERE id=?
    `).run(d.title, d.city, d.deadline, d.prize, d.prize_category,
      JSON.stringify(d.industries), d.level, d.desc,
      JSON.stringify(d.highlights), d.apply_url, d.english_url,
      d.stage, d.title_cn, d.featured ? 1 : 0, d.sort_order || 0, req.params.id);
    db.close();
    res.json({ success: true, message: 'Updated.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.delete('/api/admin/competitions/:id', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const db = getDb();
    db.prepare('DELETE FROM competitions WHERE id = ?').run(req.params.id);
    db.close();
    res.json({ success: true, message: 'Deleted.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════════════════
//  SITE CONFIG CMS API (P2)
// ════════════════════════════════════════════════════

app.get('/api/config', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value, type FROM site_config').all();
    db.close();

    const config = {};
    rows.forEach(r => {
      config[r.key] = r.type === 'boolean' ? (r.value === '1' || r.value === 'true')
                    : r.type === 'number' ? Number(r.value)
                    : r.value;
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('[config/get] Error:', error);
    res.status(500).json({ success: false, message: 'Config load failed.' });
  }
});

app.put('/api/admin/config/:key', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const { value, type } = req.body;
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO site_config (key, value, type, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(req.params.key, String(value), type || 'text');
    db.close();
    res.json({ success: true, message: `Config '${req.params.key}' updated.` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════════════════
//  ADMIN LOGIN
// ════════════════════════════════════════════════════

app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD || 'CompeteInChina2026!';

    if (username !== expectedUser || password !== expectedPass) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    // Find or create admin user in DB
    const db = getDb();
    let adminUser = db.prepare("SELECT id, email, role FROM users WHERE role='admin' LIMIT 1").get();

    if (!adminUser) {
      const result = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ('admin@competeinchina.com', ?, 'System Administrator', 'admin')
      `).run(hashPassword(expectedPass));
      adminUser = { id: result.lastInsertRowid, email: 'admin@competeinchina.com', role: 'admin' };
    }
    db.close();

    const token = generateToken(adminUser);

    console.log('[Auth] Admin login successful');

    res.json({
      success: true,
      token,
      user: adminUser
    });

  } catch (error) {
    console.error('[admin/login] Error:', error);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

// GET /api/admin/stats — Dashboard stats
app.get('/api/admin/stats', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const db = getDb();
    const stats = {
      totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      totalRegistrations: db.prepare('SELECT COUNT(*) as count FROM registrations').get().count,
      pendingRegistrations: db.prepare("SELECT COUNT(*) as count FROM registrations WHERE status='pending'").get().count,
      totalConcierge: db.prepare('SELECT COUNT(*) as count FROM concierge_applications').get().count,
      pendingConcierge: db.prepare("SELECT COUNT(*) as count FROM concierge_applications WHERE status='pending'").get().count,
      totalCompetitions: db.prepare('SELECT COUNT(*) as count FROM competitions').get().count,
      activeCompetitions: db.prepare("SELECT COUNT(*) as count FROM competitions WHERE stage='Registration'").get().count,
    };
    db.close();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════════════════
//  EXPORT CSV (Admin)
// ════════════════════════════════════════════════════

app.get('/api/admin/export/registrations', verifyToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  try {
    const db = getDb();
    const regs = db.prepare(`
      SELECT * FROM registrations ORDER BY submitted_at DESC
    `).all();
    db.close();

    // Build CSV header
    const headers = ['ID','Team Name','Country','Contact Name','Contact Email','Industry','Stage','Status','Submitted At'];
    const csvRows = [headers.join(',')];

    regs.forEach(r => {
      csvRows.push([
        r.id, `"${(r.team_name||'').replace(/"/g,'""')}"`,
        `"${(r.country||'').replace(/"/g,'""')}"`,
        `"${(r.contact_name||'').replace(/"/g,'""')}"`,
        `"${(r.contact_email||'').replace(/"/g,'""')}"`,
        `"${(r.industry||'').replace(/"/g,'""')}"`,
        `"${(r.stage||'').replace(/"/g,'""')}"`,
        r.status, r.submitted_at
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=registrations.csv');
    res.send('\uFEFF' + csvRows.join('\n')); // BOM for Excel UTF-8
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════════════════
//  FALLBACK — serve index.html for all routes
// ════════════════════════════════════════════════════

app.get('*', (req, res) => {
  // Don't intercept API calls that weren't caught
  if (req.path.startsWith('/api/') && req.path !== '/api/health') {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ════════════════════════════════════════════════════
//  START SERVER
// ════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   CompeteInChina Server Running       ║');
  console.log(`║   Local: http://localhost:${PORT.toString().padEnd(14)}     ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Auto-init DB if not exists
  const fs = require('fs');
  if (!fs.existsSync(DB_PATH)) {
    console.log('⚠  Database not found. Run: node init-db.js');
  }
});
