// ═══════════════════════════════════════════════════════════
//  CompeteInChina — Cloudflare Workers API
//  迁移自 server.js (Express + SQLite → Workers + D1)
// ═══════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt, sign, verify } from 'hono/jwt';
import { Resend } from 'resend';

// ─── App Setup ──────────────────────────────────
const app = new Hono();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// ─── Constants ──────────────────────────────────
const JWT_SECRET = 'competeinchina_jwt_secret_key_2026';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'CompeteInChina2026!';

// ─── Helpers ──────────────────────���─────────────

function hashPassword(password) {
  // SHA-256 via Web Crypto API
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(password))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
}

async function hashPasswordSync(password) {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(user) {
  return sign(
    { userId: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
    JWT_SECRET
  );
}

async function verifyToken(c) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  try {
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

// Auth middleware
async function authRequired(c, next) {
  const user = await verifyToken(c);
  if (!user) {
    return c.json({ success: false, message: 'No token provided or token expired' }, 401);
  }
  c.set('user', user);
  return next();
}

async function adminRequired(c, next) {
  const user = await verifyToken(c);
  if (!user || user.role !== 'admin') {
    return c.json({ success: false, message: 'Admin access required.' }, 403);
  }
  c.set('user', user);
  return next();
}

async function optionalAuth(c, next) {
  const user = await verifyToken(c);
  if (user) c.set('user', user);
  return next();
}

// JSON helper
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ─── Resend Email Client ───────────────────────
function getResend(c) {
  const apiKey = c.env.RESEND_API_KEY || 're_dw1bVA9M_9z2T2hoN5h82W1UnScaF77r6';
  return new Resend(apiKey);
}

// ─── In-Memory Verification Codes (per-worker, resets on deploy) ──
// In production with multiple workers, use D1 for this instead
// For now, single-worker Map is acceptable for low traffic

// ════════════════════════════════════════════════════
//  HEALTH CHECK
// ════════════════════════════════════════════════════

app.get('/api/health', async (c) => {
  let dbStatus = 'ok';
  try {
    const result = await c.env.DB.prepare('SELECT 1').first();
    dbStatus = result ? 'ok' : 'no_result';
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }
  return c.json({
    success: true,
    status: 'running (Cloudflare Workers)',
    database: dbStatus,
    time: new Date().toISOString()
  });
});

// ════════════════════════════════════════════════════
//  VERIFICATION CODE APIs
// ════════════════════════════════════════════════════

app.post('/api/send-verify-code', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return c.json({ success: false, message: 'Please enter a valid email address.' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in D1
    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO verify_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)'
    ).bind(normalizedEmail, code, expiresAt, Date.now()).run();

    // Send email via Resend
    try {
      const resend = getResend(c);
      const emailFrom = 'noreply@competeinchina.com';
      await resend.emails.send({
        from: `CompeteInChina <${emailFrom}>`,
        to: normalizedEmail,
        subject: 'Your Verification Code — CompeteInChina',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:#2563eb;color:white;padding:16px 24px;border-radius:8px 8px 0 0;margin-bottom:0;">
              <h2 style="margin:0;font-size:20px;">CompeteInChina</h2>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px;">
              <p style="font-size:15px;color:#334155;margin-bottom:16px;">Your verification code is:</p>
              <div style="background:#eff6ff;border:2px solid #2563eb;padding:20px;text-align:center;border-radius:10px;margin:20px 0;">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#2563eb;">${code}</span>
              </div>
              <p style="font-size:13px;color:#94a3b8;line-height:1.6;">
                This code expires in <strong>10 minutes</strong>.<br>
                If you didn't request this code, please ignore this email.
              </p>
            </div>
          </div>
        `
      });

      return c.json({ success: true, message: 'Verification code sent! Please check your inbox.' });
    } catch (emailError) {
      console.error('[Email] Resend failed:', emailError);
      // Remove stored code
      await c.env.DB.prepare('DELETE FROM verify_codes WHERE email = ?').bind(normalizedEmail).run();
      return c.json({ success: false, message: 'Failed to send verification email. Please check your email address and try again.', error: emailError.message }, 500);
    }
  } catch (error) {
    console.error('[send-verify-code] Error:', error);
    return c.json({ success: false, message: 'An unexpected error occurred.' }, 500);
  }
});

app.post('/api/verify-code', async (c) => {
  try {
    const { email, code } = await c.req.json();
    if (!email || !code) {
      return c.json({ success: false, message: 'Email and code are required.' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = await c.env.DB.prepare(
      'SELECT code, expires_at FROM verify_codes WHERE email = ?'
    ).bind(normalizedEmail).first();

    if (!record) {
      return c.json({ success: false, message: 'No verification code found. Please request a new one.' });
    }

    if (Date.now() > record.expires_at) {
      await c.env.DB.prepare('DELETE FROM verify_codes WHERE email = ?').bind(normalizedEmail).run();
      return c.json({ success: false, message: 'This code has expired. Please request a new one.' });
    }

    if (String(record.code) !== String(code).trim()) {
      return c.json({ success: false, message: 'Incorrect verification code. Please check and try again.' });
    }

    // Verified! Delete code
    await c.env.DB.prepare('DELETE FROM verify_codes WHERE email = ?').bind(normalizedEmail).run();

    return c.json({ success: true, message: 'Email verified successfully!' });
  } catch (error) {
    console.error('[verify-code] Error:', error);
    return c.json({ success: false, message: 'An error occurred while verifying your code.' }, 500);
  }
});

// ════════════════════════════════════════════════════
//  USER AUTHENTICATION APIs
// ════════════════════════════════════════════════════

app.post('/api/users/register', async (c) => {
  try {
    const { email, password, full_name } = await c.req.json();
    if (!email || !password) {
      return c.json({ success: false, message: 'Email and password are required.' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalizedEmail).first();
    if (existing) {
      return c.json({ success: false, message: 'This email is already registered. Please log in instead.' }, 409);
    }

    const pwHash = await hashPasswordSync(password);
    const result = await c.env.DB.prepare(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, 'user')"
    ).bind(normalizedEmail, pwHash, full_name || '').run();

    const user = { id: result.meta.last_row_id, email: normalizedEmail, full_name: full_name || '', role: 'user' };
    const token = await generateToken(user);

    return c.json({ success: true, message: 'Account created successfully!', token, user }, 201);
  } catch (error) {
    console.error('[register] Error:', error);
    return c.json({ success: false, message: 'Registration failed. Please try again.' }, 500);
  }
});

app.post('/api/users/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ success: false, message: 'Email and password are required.' }, 400);
    }

    const user = await c.env.DB.prepare(
      'SELECT id, email, full_name, role, password_hash FROM users WHERE email = ?'
    ).bind(email.trim().toLowerCase()).first();

    if (!user) {
      return c.json({ success: false, message: 'Incorrect email or password.' }, 401);
    }

    const pwHash = await hashPasswordSync(password);
    if (user.password_hash !== pwHash) {
      return c.json({ success: false, message: 'Incorrect email or password.' }, 401);
    }

    const token = await generateToken({ id: user.id, email: user.email, role: user.role });

    return c.json({
      success: true, message: 'Login successful!', token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    });
  } catch (error) {
    console.error('[login] Error:', error);
    return c.json({ success: false, message: 'Login failed.' }, 500);
  }
});

app.post('/api/users/auth-for-form', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) {
      return c.json({ success: false, message: 'Email is required.' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = await c.env.DB.prepare(
      'SELECT id, email, full_name, role FROM users WHERE email = ?'
    ).bind(normalizedEmail).first();

    if (!user) {
      const pwHash = await hashPasswordSync('auto_form_' + Date.now());
      const result = await c.env.DB.prepare(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, '', 'user')"
      ).bind(normalizedEmail, pwHash).run();
      user = { id: result.meta.last_row_id, email: normalizedEmail, full_name: '', role: 'user' };
    }

    const token = await generateToken(user);
    return c.json({ success: true, message: 'Authentication successful.', token, user });
  } catch (error) {
    console.error('[auth-for-form] Error:', error);
    return c.json({ success: false, message: 'Authentication failed.' }, 500);
  }
});

app.get('/api/users/me', authRequired, async (c) => {
  try {
    const u = c.get('user');
    const user = await c.env.DB.prepare(
      'SELECT id, email, full_name, role, created_at FROM users WHERE id = ?'
    ).bind(u.userId).first();

    if (!user) return c.json({ success: false, message: 'User not found.' }, 404);
    return c.json({ success: true, user });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch user.' }, 500);
  }
});

app.patch('/api/users/me', authRequired, async (c) => {
  try {
    const { full_name, email } = await c.req.json();
    if (!full_name && !email) {
      return c.json({ success: false, message: 'At least one field must be provided.' }, 400);
    }

    const u = c.get('user');
    const db = c.env.DB;

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db.prepare(
        'SELECT id FROM users WHERE email = ? AND id != ?'
      ).bind(normalizedEmail, u.userId).first();
      if (existing) {
        return c.json({ success: false, message: 'This email is already in use.' }, 409);
      }
      await db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(normalizedEmail, u.userId).run();
    }

    if (full_name !== undefined) {
      await db.prepare('UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(full_name.trim(), u.userId).run();
    }

    const user = await db.prepare(
      'SELECT id, email, full_name, role, created_at, updated_at FROM users WHERE id = ?'
    ).bind(u.userId).first();

    return c.json({ success: true, message: 'Profile updated successfully.', user });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to update profile.' }, 500);
  }
});

app.post('/api/users/change-password', authRequired, async (c) => {
  try {
    const { currentPassword, newPassword } = await c.req.json();
    if (!currentPassword || !newPassword) {
      return c.json({ success: false, message: 'Current and new password are required.' }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ success: false, message: 'New password must be at least 8 characters.' }, 400);
    }

    const u = c.get('user');
    const stored = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.userId).first();

    const curHash = await hashPasswordSync(currentPassword);
    if (stored.password_hash !== curHash) {
      return c.json({ success: false, message: 'Current password is incorrect.' }, 401);
    }

    const newHash = await hashPasswordSync(newPassword);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(newHash, u.userId).run();

    return c.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to change password.' }, 500);
  }
});

app.post('/api/users/reset-password', async (c) => {
  try {
    const { email, newPassword } = await c.req.json();
    if (!email || !newPassword) {
      return c.json({ success: false, message: 'Email and new password are required.' }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ success: false, message: 'New password must be at least 8 characters.' }, 400);
    }

    const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.trim().toLowerCase()).first();
    if (!user) {
      return c.json({ success: false, message: 'No account found with this email address.' }, 404);
    }

    const newHash = await hashPasswordSync(newPassword);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
      .bind(newHash, email.trim().toLowerCase()).run();

    return c.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to reset password.' }, 500);
  }
});

app.get('/api/users/my-applications', authRequired, async (c) => {
  try {
    const apps = await c.env.DB.prepare(
      'SELECT * FROM registrations WHERE user_id = ? ORDER BY submitted_at DESC'
    ).bind(c.get('user').userId).all();
    return c.json({ success: true, applications: apps.results });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load applications.' }, 500);
  }
});

// ════════════════════════════════════════════════════
//  REGISTRATION SUBMISSION API
// ════════════════════════════════════════════════════

app.post('/api/registrations', authRequired, async (c) => {
  try {
    const data = await c.req.json();
    if (!data.team_name || !data.contact_email) {
      return c.json({ success: false, message: 'Team name and contact email are required.' }, 400);
    }

    const u = c.get('user');
    const db = c.env.DB;

    // Check duplicate
    const duplicate = await db.prepare(
      'SELECT id FROM registrations WHERE contact_email = ?'
    ).bind(data.contact_email.toLowerCase()).first();
    if (duplicate) {
      return c.json({ success: false, message: 'You have already submitted a registration with this email.' }, 409);
    }

    const result = await db.prepare(`
      INSERT INTO registrations (
        user_id, team_name, country, team_size, stage, oneliner,
        contact_name, contact_role, contact_email, contact_phone,
        contact_linkedin, contact_wechat, passport, industry, keywords,
        product_desc, business_model, funded, funding_round,
        funding_amount, investors, ip, cn_funding, cn_cities,
        register_cn, cn_setup, roadmap, support_needed,
        team_members, team_stability, resume, website,
        auth_agree, pitch_deck,
        extra_links, notes, competition_ids, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", datetime("now"))
    `).bind(
      u.userId, data.team_name, data.country || '', data.team_size || '',
      data.stage || '', data.oneliner || '', data.contact_name || '',
      data.contact_role || '', data.contact_email.toLowerCase(), data.contact_phone || '',
      data.contact_linkedin || '', data.contact_wechat || '', data.passport || '',
      Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || ''),
      data.keywords || '', data.product_desc || '', data.business_model || '',
      Array.isArray(data.funded) ? data.funded.join(', ') : (data.funded || ''),
      data.funding_round || '', data.funding_amount || '', data.investors || '',
      data.ip || '', data.cn_funding || '', data.cn_cities || '',
      Array.isArray(data.register_cn) ? data.register_cn.join(', ') : (data.register_cn || ''),
      data.cn_setup || '', data.roadmap || '',
      Array.isArray(data.support_needed) ? data.support_needed.join(', ') : (data.support_needed || ''),
      data.team_members || '', data.team_stability || '',
      data.resume || '', data.website || '',
      data.auth_agree ? 1 : 0, data.pitch_deck || '',
      data.extra_links || '', data.notes || '',
      Array.isArray(data.competition_ids) ? data.competition_ids.join(', ') : (data.competition_ids || '')
    ).run();

    return c.json({
      success: true,
      message: 'Registration submitted successfully! We will review and get back to you within 48 hours.',
      registrationId: result.meta.last_row_id
    }, 201);
  } catch (error) {
    console.error('[registration] Error:', error);
    return c.json({ success: false, message: 'Submission failed. Please try again.' }, 500);
  }
});

app.get('/api/registrations', authRequired, async (c) => {
  const u = c.get('user');
  if (u.role !== 'admin') return c.json({ success: false, message: 'Admin access required.' }, 403);
  try {
    const regs = await c.env.DB.prepare(`
      SELECT r.*, u.full_name as user_full_name
      FROM registrations r LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.submitted_at DESC
    `).all();
    return c.json({ success: true, registrations: regs.results });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.patch('/api/registrations/:id/status', authRequired, async (c) => {
  const u = c.get('user');
  if (u.role !== 'admin') return c.json({ success: false, message: 'Admin access required.' }, 403);
  try {
    const { status } = await c.req.json();
    const allowed = ['pending', 'reviewed', 'approved', 'rejected'];
    if (!allowed.includes(status)) return c.json({ success: false, message: 'Invalid status.' }, 400);

    await c.env.DB.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
    return c.json({ success: true, message: `Status updated to ${status}.` });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.patch('/api/registrations/:id', authRequired, async (c) => {
  try {
    const u = c.get('user');
    const db = c.env.DB;
    const reg = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(c.req.param('id')).first();

    if (!reg) return c.json({ success: false, message: 'Registration not found.' }, 404);
    if (reg.user_id !== u.userId && u.role !== 'admin') return c.json({ success: false, message: 'Access denied.' }, 403);
    if (reg.status !== 'pending' && u.role !== 'admin') return c.json({ success: false, message: 'Only pending registrations can be edited.' }, 400);

    const data = await c.req.json();
    await db.prepare(`
      UPDATE registrations SET
        team_name = ?, country = ?, team_size = ?, stage = ?, oneliner = ?,
        contact_name = ?, contact_role = ?, contact_phone = ?,
        contact_linkedin = ?, contact_wechat = ?, industry = ?, keywords = ?,
        product_desc = ?, business_model = ?, funded = ?, funding_round = ?,
        funding_amount = ?, investors = ?, ip = ?, cn_funding = ?, cn_cities = ?,
        register_cn = ?, cn_setup = ?, roadmap = ?, support_needed = ?,
        team_members = ?, team_stability = ?, resume = ?, website = ?,
        passport = ?, pitch_deck = ?,
        extra_links = ?, notes = ?, competition_ids = ?
      WHERE id = ?
    `).bind(
      data.team_name || reg.team_name, data.country || reg.country,
      data.team_size || reg.team_size, data.stage || reg.stage,
      data.oneliner || reg.oneliner, data.contact_name || reg.contact_name,
      data.contact_role || reg.contact_role, data.contact_phone || reg.contact_phone,
      data.contact_linkedin || reg.contact_linkedin, data.contact_wechat || reg.contact_wechat,
      data.industry || reg.industry, data.keywords || reg.keywords,
      data.product_desc || reg.product_desc, data.business_model || reg.business_model,
      data.funded || reg.funded, data.funding_round || reg.funding_round,
      data.funding_amount || reg.funding_amount, data.investors || reg.investors,
      data.ip || reg.ip, data.cn_funding || reg.cn_funding,
      data.cn_cities || reg.cn_cities, data.register_cn || reg.register_cn,
      data.cn_setup || reg.cn_setup, data.roadmap || reg.roadmap,
      data.support_needed || reg.support_needed, data.team_members || reg.team_members,
      data.team_stability || reg.team_stability, data.resume || reg.resume,
      data.website || reg.website, data.passport || reg.passport,
      data.pitch_deck || reg.pitch_deck,
      data.extra_links || reg.extra_links, data.notes || reg.notes,
      data.competition_ids || reg.competition_ids, c.req.param('id')
    ).run();

    const updated = await db.prepare('SELECT * FROM registrations WHERE id = ?').bind(c.req.param('id')).first();
    return c.json({ success: true, message: 'Registration updated.', registration: updated });
  } catch (error) {
    return c.json({ success: false, message: 'Update failed.' }, 500);
  }
});

// ════════════════════════════════════════════════════
//  CONCIERGE APPLICATION API
// ════════════════════════════════════════════════════

app.post('/api/concierge', optionalAuth, async (c) => {
  try {
    const data = await c.req.json();
    if (!data.company_name || !data.contact_person || !data.email) {
      return c.json({ success: false, message: 'Company name, contact person, and email are required.' }, 400);
    }

    const u = c.get('user');
    const result = await c.env.DB.prepare(`
      INSERT INTO concierge_applications (
        user_id, company_name, contact_person, email, phone, whatsapp,
        industry, target_competitions, timeline, budget_range,
        special_requirements, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      u?.userId || null, data.company_name, data.contact_person,
      data.email.toLowerCase(), data.phone || '', data.whatsapp || '',
      Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || ''),
      Array.isArray(data.target_competitions) ? data.target_competitions.join(', ') : (data.target_competitions || ''),
      data.timeline || '', data.budget_range || '',
      data.special_requirements || '', data.notes || ''
    ).run();

    return c.json({
      success: true,
      message: 'Concierge request received! We will contact you within 24 hours.',
      applicationId: result.meta.last_row_id
    }, 201);
  } catch (error) {
    return c.json({ success: false, message: 'Submission failed.' }, 500);
  }
});

app.get('/api/concierge', authRequired, async (c) => {
  if (c.get('user').role !== 'admin') return c.json({ success: false, message: 'Admin access required.' }, 403);
  try {
    const apps = await c.env.DB.prepare('SELECT * FROM concierge_applications ORDER BY created_at DESC').all();
    return c.json({ success: true, applications: apps.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/concierge/my', authRequired, async (c) => {
  try {
    const apps = await c.env.DB.prepare(
      'SELECT * FROM concierge_applications WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(c.get('user').userId).all();
    return c.json({ success: true, applications: apps.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ════════════════════════════════════════════════════
//  ORGANIZER SUBMISSIONS
// ════════════════════════════════════════════════════

app.post('/api/organizer-submission', optionalAuth, async (c) => {
  try {
    const data = await c.req.json();
    if (!data.name || !data.city || !data.website || !data.contact || !data.email) {
      return c.json({ success: false, message: 'All required fields must be filled.' }, 400);
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO organizer_submissions (
        comp_name, city, prize, deadline, industry, website, description,
        contact_name, contact_email, phone, wechat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.name, data.city || '', data.prize || '', data.deadline || '',
      data.industry || '', data.website, data.description || '',
      data.contact, data.email, data.phone || '', data.wechat || ''
    ).run();

    return c.json({
      success: true,
      message: 'Thank you! Your competition has been submitted for review.',
      submissionId: result.meta.last_row_id
    }, 201);
  } catch (error) {
    return c.json({ success: false, message: 'Submission failed.' }, 500);
  }
});

// ════════════════════════════════════════════════════
//  COMPETITIONS API
// ════════════════════════════════════════════════════

app.get('/api/competitions', async (c) => {
  try {
    let query = 'SELECT * FROM competitions ORDER BY sort_order ASC, id ASC';
    let params = [];

    const city = c.req.query('city');
    const featured = c.req.query('featured');

    if (city) {
      query = 'SELECT * FROM competitions WHERE city = ? ORDER BY sort_order ASC, id ASC';
      params = [city];
    } else if (featured === 'true') {
      query = 'SELECT * FROM competitions WHERE featured = 1 ORDER BY sort_order ASC, id ASC';
    }

    const result = await c.env.DB.prepare(query).bind(...params).all();
    const comps = result.results.map(c => ({
      ...c,
      industries: typeof c.industries === 'string' ? JSON.parse(c.industries || '[]') : (c.industries || []),
      highlights: typeof c.highlights === 'string' ? JSON.parse(c.highlights || '[]') : (c.highlights || [])
    }));

    return c.json({ success: true, competitions: comps });
  } catch (error) {
    return c.json({ success: false, message: 'Load failed.' }, 500);
  }
});

app.get('/api/competitions/:id', async (c) => {
  try {
    const comp = await c.env.DB.prepare('SELECT * FROM competitions WHERE id = ?').bind(c.req.param('id')).first();
    if (!comp) return c.json({ success: false, message: 'Competition not found.' }, 404);

    comp.industries = typeof comp.industries === 'string' ? JSON.parse(comp.industries || '[]') : (comp.industries || []);
    comp.highlights = typeof comp.highlights === 'string' ? JSON.parse(comp.highlights || '[]') : (comp.highlights || []);

    return c.json({ success: true, competition: comp });
  } catch (error) {
    return c.json({ success: false, message: 'Load failed.' }, 500);
  }
});

// ════════════════════════════════════════════════════
//  ADMIN APIs (with /api/admin prefix)
// ════════════════════════════════════════════════════

app.get('/api/admin/competitions', adminRequired, async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT * FROM competitions ORDER BY sort_order ASC, id ASC').all();
    const comps = result.results.map(c => ({
      ...c,
      industries: typeof c.industries === 'string' ? JSON.parse(c.industries || '[]') : (c.industries || []),
      highlights: typeof c.highlights === 'string' ? JSON.parse(c.highlights || '[]') : (c.highlights || [])
    }));
    return c.json({ success: true, competitions: comps });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.post('/api/admin/competitions', adminRequired, async (c) => {
  try {
    const d = await c.req.json();
    const result = await c.env.DB.prepare(`
      INSERT INTO competitions (title, city, deadline, prize, prize_category, industries,
        level, desc, highlights, apply_url, english_url, stage, title_cn, featured, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      d.title, d.city, d.deadline || '', d.prize || '', d.prize_category || '',
      JSON.stringify(d.industries || []), d.level || '', d.desc || '',
      JSON.stringify(d.highlights || []), d.apply_url || '', d.english_url || '',
      d.stage || 'Registration', d.title_cn || '', d.featured ? 1 : 0, d.sort_order || 0
    ).run();
    return c.json({ success: true, id: result.meta.last_row_id, message: 'Competition added.' }, 201);
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.put('/api/admin/competitions/:id', adminRequired, async (c) => {
  try {
    const d = await c.req.json();
    await c.env.DB.prepare(`
      UPDATE competitions SET title=?, city=?, deadline=?, prize=?, prize_category=?,
        industries=?, level=?, desc=?, highlights=?, apply_url=?, english_url=?,
        stage=?, title_cn=?, featured=?, sort_order=?
      WHERE id=?
    `).bind(
      d.title, d.city, d.deadline, d.prize, d.prize_category,
      JSON.stringify(d.industries), d.level, d.desc,
      JSON.stringify(d.highlights), d.apply_url, d.english_url,
      d.stage, d.title_cn, d.featured ? 1 : 0, d.sort_order || 0, c.req.param('id')
    ).run();
    return c.json({ success: true, message: 'Updated.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.delete('/api/admin/competitions/:id', adminRequired, async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM competitions WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true, message: 'Deleted.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── SITE CONFIG CMS ─────────────────────────────

app.get('/api/config', async (c) => {
  try {
    const rows = await c.env.DB.prepare('SELECT key, value, type FROM site_config').all();
    const config = {};
    rows.results.forEach(r => {
      config[r.key] = r.type === 'boolean' ? (r.value === '1' || r.value === 'true')
                    : r.type === 'number' ? Number(r.value)
                    : r.value;
    });
    return c.json({ success: true, config });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.put('/api/admin/config/:key', adminRequired, async (c) => {
  try {
    const { value, type } = await c.req.json();
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO site_config (key, value, type, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(c.req.param('key'), String(value), type || 'text').run();
    return c.json({ success: true, message: `Config '${c.req.param('key')}' updated.` });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN LOGIN ─────────────────────────────────

app.post('/api/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return c.json({ success: false, message: 'Invalid username or password.' }, 401);
    }

    const db = c.env.DB;
    let adminUser = await db.prepare("SELECT id, email, role FROM users WHERE role='admin' LIMIT 1").first();

    if (!adminUser) {
      const pwHash = await hashPasswordSync(ADMIN_PASSWORD);
      const result = await db.prepare(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES ('admin@competeinchina.com', ?, 'System Administrator', 'admin')"
      ).bind(pwHash).run();
      adminUser = { id: result.meta.last_row_id, email: 'admin@competeinchina.com', role: 'admin' };
    }

    const token = await generateToken(adminUser);
    return c.json({ success: true, token, user: adminUser });
  } catch (error) {
    return c.json({ success: false, message: 'Login failed.' }, 500);
  }
});

// ─── ADMIN STATS ─────────────────────────────────

app.get('/api/admin/stats', adminRequired, async (c) => {
  try {
    const db = c.env.DB;
    const [totalUsers, totalRegs, pendingRegs, totalConcierge, pendingConcierge, totalComps, activeComps] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM users').first(),
      db.prepare('SELECT COUNT(*) as count FROM registrations').first(),
      db.prepare("SELECT COUNT(*) as count FROM registrations WHERE status='pending'").first(),
      db.prepare('SELECT COUNT(*) as count FROM concierge_applications').first(),
      db.prepare("SELECT COUNT(*) as count FROM concierge_applications WHERE status='pending'").first(),
      db.prepare('SELECT COUNT(*) as count FROM competitions').first(),
      db.prepare("SELECT COUNT(*) as count FROM competitions WHERE stage='Registration'").first(),
    ]);

    return c.json({ success: true, stats: {
      totalUsers: totalUsers.count, totalRegistrations: totalRegs.count,
      pendingRegistrations: pendingRegs.count, totalConcierge: totalConcierge.count,
      pendingConcierge: pendingConcierge.count, totalCompetitions: totalComps.count,
      activeCompetitions: activeComps.count,
    }});
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: USERS ────────────────────────────────

app.get('/api/admin/users', adminRequired, async (c) => {
  try {
    const users = await c.env.DB.prepare(
      'SELECT id, email, full_name, role, created_at, updated_at FROM users ORDER BY created_at DESC'
    ).all();
    return c.json({ success: true, users: users.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: REGISTRATIONS ────────────────────────

app.get('/api/admin/registrations', adminRequired, async (c) => {
  try {
    const regs = await c.env.DB.prepare(
      'SELECT r.*, u.full_name as user_full_name, u.email as user_email FROM registrations r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.submitted_at DESC'
    ).all();
    return c.json({ success: true, registrations: regs.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.patch('/api/admin/registrations/:id/status', adminRequired, async (c) => {
  try {
    const { status } = await c.req.json();
    if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status))
      return c.json({ success: false, message: 'Invalid status.' }, 400);
    await c.env.DB.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
    return c.json({ success: true, message: 'Status updated.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: CONCIERGE ────────────────────────────

app.get('/api/admin/concierge', adminRequired, async (c) => {
  try {
    const apps = await c.env.DB.prepare('SELECT * FROM concierge_applications ORDER BY created_at DESC').all();
    return c.json({ success: true, applications: apps.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: ORGANIZER SUBMISSIONS ────────────────

app.get('/api/admin/organizer-submissions', adminRequired, async (c) => {
  try {
    const subs = await c.env.DB.prepare('SELECT * FROM organizer_submissions ORDER BY created_at DESC').all();
    return c.json({ success: true, submissions: subs.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.patch('/api/admin/organizer-submissions/:id/status', adminRequired, async (c) => {
  try {
    const { status } = await c.req.json();
    if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status))
      return c.json({ success: false, message: 'Invalid status.' }, 400);
    await c.env.DB.prepare('UPDATE organizer_submissions SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
    return c.json({ success: true, message: 'Status updated.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: EXPORT CSV ───────────────────────────

app.get('/api/admin/export/registrations', adminRequired, async (c) => {
  try {
    const regs = await c.env.DB.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();
    const headers = ['ID', 'Team Name', 'Country', 'Contact Name', 'Contact Email', 'Industry', 'Stage', 'Status', 'Submitted At'];
    const csvRows = [headers.join(',')];

    regs.results.forEach(r => {
      csvRows.push([
        r.id, `"${(r.team_name || '').replace(/"/g, '""')}"`,
        `"${(r.country || '').replace(/"/g, '""')}"`,
        `"${(r.contact_name || '').replace(/"/g, '""')}"`,
        `"${(r.contact_email || '').replace(/"/g, '""')}"`,
        `"${(r.industry || '').replace(/"/g, '""')}"`,
        `"${(r.stage || '').replace(/"/g, '""')}"`,
        r.status, r.submitted_at
      ].join(','));
    });

    return new Response('\uFEFF' + csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=registrations.csv'
      }
    });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ─── ADMIN: EXPIRING COMPETITIONS ────────────────

app.get('/api/admin/expiring', adminRequired, async (c) => {
  try {
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    const today = new Date().toISOString().substring(0, 10);

    const [expiring, expired] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id, title, city, deadline, prize, stage FROM competitions WHERE deadline >= ? AND deadline <= ? AND stage != 'Closed' ORDER BY deadline ASC"
      ).bind(today, sevenDays).all(),
      c.env.DB.prepare(
        "SELECT id, title, city, deadline, prize, stage FROM competitions WHERE deadline < ? AND stage != 'Closed' ORDER BY deadline DESC"
      ).bind(today).all(),
    ]);

    return c.json({ success: true, expiring: expiring.results, expired: expired.results, today });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.post('/api/admin/auto-close-expired', adminRequired, async (c) => {
  try {
    const today = new Date().toISOString().substring(0, 10);
    const result = await c.env.DB.prepare(
      "UPDATE competitions SET stage = 'Closed' WHERE deadline < ? AND stage != 'Closed'"
    ).bind(today).run();
    return c.json({ success: true, closed: result.meta.changes, date: today });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ════════════════════════════════════════════════════
//  COMPETITION TRACKING
// ════════════════════════════════════════════════════

const TRACKING_STAGES = [
  'registering', 'submitted', 'preliminary', 'advanced_semi',
  'semi_finals', 'advanced_finals', 'finals', 'prize_processing', 'prize_received'
];

app.get('/api/tracking/my', authRequired, async (c) => {
  try {
    const records = await c.env.DB.prepare(
      'SELECT * FROM competition_tracking WHERE user_id = ? ORDER BY stage_updated_at DESC'
    ).bind(c.get('user').userId).all();
    return c.json({ success: true, records: records.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.post('/api/tracking/request', authRequired, async (c) => {
  try {
    const { competition_name, competition_id, competition_url, notes } = await c.req.json();
    let finalName = competition_name;

    if (competition_id) {
      const comp = await c.env.DB.prepare('SELECT title FROM competitions WHERE id = ?').bind(competition_id).first();
      if (comp) finalName = comp.title;
      else return c.json({ success: false, message: 'Competition not found in database.' }, 400);
    }

    if (!finalName) return c.json({ success: false, message: 'Competition name is required.' }, 400);

    const result = await c.env.DB.prepare(
      'INSERT INTO competition_tracking (user_id, competition_name, competition_id, current_stage, notes) VALUES (?, ?, ?, ?, ?)'
    ).bind(c.get('user').userId, finalName, competition_id || null, 'registering',
      notes || (competition_url ? 'Official URL: ' + competition_url : '')).run();

    return c.json({ success: true, id: result.meta.last_row_id, message: 'Tracking request submitted.' }, 201);
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/admin/tracking', adminRequired, async (c) => {
  try {
    const records = await c.env.DB.prepare(`
      SELECT t.*, u.email as user_email, u.full_name as user_name
      FROM competition_tracking t JOIN users u ON t.user_id = u.id
      ORDER BY t.updated_at DESC
    `).all();
    return c.json({ success: true, records: records.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.post('/api/admin/tracking', adminRequired, async (c) => {
  try {
    const { user_id, competition_name, competition_id, current_stage, notes } = await c.req.json();
    if (!user_id || !competition_name) return c.json({ success: false, message: 'User and competition name are required.' }, 400);

    const stage = current_stage && TRACKING_STAGES.includes(current_stage) ? current_stage : 'registering';
    const result = await c.env.DB.prepare(
      'INSERT INTO competition_tracking (user_id, competition_name, competition_id, current_stage, notes) VALUES (?, ?, ?, ?, ?)'
    ).bind(user_id, competition_name, competition_id || null, stage, notes || '').run();

    return c.json({ success: true, id: result.meta.last_row_id, message: 'Tracking record created.' }, 201);
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.patch('/api/admin/tracking/:id', adminRequired, async (c) => {
  try {
    const { current_stage, notes, competition_name, competition_id } = await c.req.json();
    const db = c.env.DB;
    const existing = await db.prepare('SELECT * FROM competition_tracking WHERE id = ?').bind(c.req.param('id')).first();
    if (!existing) return c.json({ success: false, message: 'Record not found.' }, 404);

    const stage = current_stage && TRACKING_STAGES.includes(current_stage) ? current_stage : existing.current_stage;
    const stageChanged = stage !== existing.current_stage;

    await db.prepare(`
      UPDATE competition_tracking SET
        current_stage = ?, notes = ?, competition_name = ?,
        competition_id = ?, stage_updated_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      stage, notes !== undefined ? notes : existing.notes,
      competition_name || existing.competition_name,
      competition_id !== undefined ? (competition_id || null) : existing.competition_id,
      stageChanged ? new Date().toISOString() : existing.stage_updated_at,
      c.req.param('id')
    ).run();

    return c.json({ success: true, message: 'Tracking record updated.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.delete('/api/admin/tracking/:id', adminRequired, async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM competition_tracking WHERE id = ?').bind(c.req.param('id')).run();
    return c.json({ success: true, message: 'Tracking record deleted.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/admin/tracking/stats', adminRequired, async (c) => {
  try {
    const db = c.env.DB;
    const total = await db.prepare('SELECT COUNT(*) as c FROM competition_tracking').first();
    const stats = { total: total.c };
    for (const s of TRACKING_STAGES) {
      const r = await db.prepare('SELECT COUNT(*) as c FROM competition_tracking WHERE current_stage = ?').bind(s).first();
      stats[s] = r.c;
    }
    return c.json({ success: true, stats });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

// ════════════════════════════════════════════════════
//  AGREEMENT SIGNATURES
// ════════════════════════════════════════════════════

app.get('/api/agreements/status', authRequired, async (c) => {
  try {
    const sigs = await c.env.DB.prepare(
      'SELECT agreement_type, full_name, signed_at FROM agreement_signatures WHERE user_id = ?'
    ).bind(c.get('user').userId).all();

    const status = {
      service_agreement: sigs.results.find(s => s.agreement_type === 'service_agreement') || null,
      nda: sigs.results.find(s => s.agreement_type === 'nda') || null,
      marketing_auth: sigs.results.find(s => s.agreement_type === 'marketing_auth') || null
    };
    return c.json({ success: true, status });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.post('/api/agreements/sign', authRequired, async (c) => {
  try {
    const { agreement_type, full_name } = await c.req.json();
    if (!agreement_type || !['service_agreement', 'nda', 'marketing_auth'].includes(agreement_type)) {
      return c.json({ success: false, message: 'Invalid agreement type.' }, 400);
    }
    if (!full_name || !full_name.trim()) {
      return c.json({ success: false, message: 'Full name is required for signature.' }, 400);
    }

    const u = c.get('user');
    const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(u.userId).first();

    const result = await c.env.DB.prepare(`
      INSERT OR REPLACE INTO agreement_signatures (user_id, agreement_type, full_name, email, ip_address, user_agent, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(u.userId, agreement_type, full_name.trim(), user ? user.email : u.email || '',
      c.req.header('CF-Connecting-IP') || '', c.req.header('User-Agent') || '').run();

    return c.json({ success: true, id: result.meta.last_row_id, message: 'Agreement signed successfully.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/admin/agreements', adminRequired, async (c) => {
  try {
    const db = c.env.DB;
    const users = await db.prepare('SELECT id, email, full_name FROM users ORDER BY id').all();
    const signatures = await db.prepare('SELECT user_id, agreement_type, full_name, signed_at FROM agreement_signatures ORDER BY signed_at DESC').all();

    const userMap = {};
    users.results.forEach(u => {
      userMap[u.id] = { id: u.id, email: u.email, full_name: u.full_name || '', agreements: {} };
    });
    signatures.results.forEach(s => {
      if (userMap[s.user_id]) {
        userMap[s.user_id].agreements[s.agreement_type] = { full_name: s.full_name, signed_at: s.signed_at };
      }
    });

    return c.json({ success: true, users: Object.values(userMap) });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.delete('/api/admin/agreements/:userId/:type', adminRequired, async (c) => {
  const { userId, type } = c.req.param();
  if (!['service_agreement', 'nda', 'marketing_auth'].includes(type)) {
    return c.json({ success: false, message: 'Invalid agreement type.' }, 400);
  }
  try {
    const result = await c.env.DB.prepare(
      'DELETE FROM agreement_signatures WHERE user_id = ? AND agreement_type = ?'
    ).bind(userId, type).run();
    return c.json({ success: true, deleted: result.meta.changes, message: 'Agreement revoked.' });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/admin/agreements/all', adminRequired, async (c) => {
  try {
    const agreements = await c.env.DB.prepare('SELECT * FROM agreement_signatures ORDER BY signed_at DESC').all();
    return c.json({ success: true, agreements: agreements.results });
  } catch (e) { return c.json({ success: false, message: e.message }, 500); }
});

app.get('/api/admin/agreements/:userId/:type/pdf', adminRequired, async (c) => {
  const { userId, type } = c.req.param();
  if (!['service_agreement', 'nda', 'marketing_auth'].includes(type)) {
    return c.text('Invalid agreement type.', 400);
  }
  try {
    const db = c.env.DB;
    const sig = await db.prepare(
      'SELECT * FROM agreement_signatures WHERE user_id = ? AND agreement_type = ?'
    ).bind(userId, type).first();
    const user = await db.prepare('SELECT email, full_name FROM users WHERE id = ?').bind(userId).first();

    if (!sig) return c.text('Agreement not found.', 404);

    const names = {
      service_agreement: 'Innovation Competition Facilitation Agreement',
      nda: 'Non-Disclosure Agreement (NDA)',
      marketing_auth: 'Marketing Authorization'
    };

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${names[type]}</title>
<style>
  body { font-family: 'Times New Roman', serif; max-width: 700px; margin: 40px auto; line-height: 1.8; color: #1a1a1a; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  .meta { text-align: center; color: #666; font-size: 13px; margin-bottom: 30px; }
  .sig-block { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; }
  .sig-line { margin: 20px 0; }
  .sig-line span { display: inline-block; min-width: 250px; border-bottom: 1px solid #333; }
  .seal { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
</style></head><body>
<h1>${names[type]}</h1>
<p class="meta">Electronically signed agreement between CompeteInChina / TechinBridge and the signatory below.</p>
<div class="sig-block">
  <p><strong>Signatory:</strong> ${sig.full_name}</p>
  <p><strong>Email:</strong> ${user ? user.email : sig.email}</p>
  <p><strong>Signed on:</strong> ${sig.signed_at ? sig.signed_at.substring(0, 19).replace('T', ' ') : 'Unknown'}</p>
  <p><strong>Agreement Type:</strong> ${type.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase())}</p>
  <p><strong>IP Address:</strong> ${sig.ip_address || 'N/A'}</p>
</div>
<div class="sig-line">
  <p><strong>Electronic Signature:</strong> <span>${sig.full_name}</span></p>
  <p style="font-size:12px;color:#888;">Typing one's name constitutes an electronic signature, legally equivalent to a handwritten signature under applicable e-signature laws.</p>
</div>
<div class="seal">
  <p>This document was electronically generated by CompeteInChina on ${new Date().toISOString().substring(0, 10)}.</p>
  <p>For verification, contact: competitions@techinbridge.com</p>
</div>
</body></html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}_agreement_${sig.full_name.replace(/\\s/g, '_')}.html"`
      }
    });
  } catch (e) { return c.text('Generation failed: ' + e.message, 500); }
});

// ════════════════════════════════════════════════════
//  CATCH-ALL — 404 for unknown API routes
// ════════════════════════════════════════════════════

app.all('/api/*', (c) => {
  return c.json({ success: false, message: 'API endpoint not found.' }, 404);
});

// ════════════════════════════════════════════════════
//  EXPORT for Cloudflare Workers
// ════════════════════════════════════════════════════

export default app;
