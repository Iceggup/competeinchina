// ═══════════════════════════════════════════════════════════
//  CompeteInChina — Cloudflare Workers API (Native Format)
//  纯原生 Workers 代码，可直接粘贴到 Cloudflare 网页编辑器
//  不需要任何 npm 模块
// ═══════════════════════════════════════════════════════════

// ─── Constants ──────────────────────────────────
const JWT_SECRET = 'competeinchina_jwt_secret_key_2026';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'CompeteInChina2026!';
const RESEND_API_KEY = 're_dw1bVA9M_9z2T2hoN5h82W1UnScaF77r6';
const EMAIL_FROM = 'noreply@competeinchina.com';

const TRACKING_STAGES = [
  'registering', 'submitted', 'preliminary', 'advanced_semi',
  'semi_finals', 'advanced_finals', 'finals', 'prize_processing', 'prize_received'
];

// ─── CORS Headers ───────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// ─── Helpers ──────────────────────────────────────
function json(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function addCors(response) {
  const newHeaders = new Headers(response.headers);
  Object.keys(corsHeaders).forEach(k => newHeaders.set(k, corsHeaders[k]));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function generateToken(user) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  }));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(header + '.' + payload));
  const signature = base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));

  return header + '.' + payload + '.' + signature;
}

async function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const sigBytes = Uint8Array.from(base64UrlDecode(parts[2]), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(parts[0] + '.' + parts[1]));
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function getAuthUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.split(' ')[1]);
}

// ─── Resend Email ────────────────────────────────
async function sendEmail(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'CompeteInChina <' + EMAIL_FROM + '>',
      to: to,
      subject: subject,
      html: html
    })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Email send failed');
  }
  return response.json();
}

// ════════════════════════════════════════════════════
//  ROUTER
// ════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ═══ HEALTH CHECK ═══
    if (path === '/api/health' && method === 'GET') {
      let dbStatus = 'ok';
      try {
        const result = await env.db.prepare('SELECT 1 as test').first();
        dbStatus = result ? 'ok' : 'no_result';
      } catch (e) {
        dbStatus = 'error: ' + e.message;
      }
      return json({
        success: true,
        status: 'running (Cloudflare Workers)',
        database: dbStatus,
        time: new Date().toISOString()
      });
    }

    // ═══ TEST DB ═══
    if (path === '/api/test-db' && method === 'GET') {
      try {
        const result = await env.db.prepare('SELECT 1 as test').first();
        return json({ success: true, db: 'connected', result });
      } catch (e) {
        return json({ success: false, error: e.message }, 500);
      }
    }

    // ═══ VERIFICATION CODE ═══
    if (path === '/api/send-verify-code' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ success: false, message: 'Please enter a valid email address.' }, 400);
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 10 * 60 * 1000;

        await env.db.prepare(
          'INSERT OR REPLACE INTO verify_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)'
        ).bind(email, code, expiresAt, Date.now()).run();

        try {
          await sendEmail(email, 'Your Verification Code — CompeteInChina', `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#2563eb;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
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
          `);
          return json({ success: true, message: 'Verification code sent! Please check your inbox.' });
        } catch (emailError) {
          await env.db.prepare('DELETE FROM verify_codes WHERE email = ?').bind(email).run();
          return json({ success: false, message: 'Failed to send verification email. Please check your email address and try again.', error: emailError.message }, 500);
        }
      } catch (e) {
        return json({ success: false, message: 'An unexpected error occurred.' }, 500);
      }
    }

    if (path === '/api/verify-code' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const code = body.code;

        if (!email || !code) {
          return json({ success: false, message: 'Email and code are required.' }, 400);
        }

        const record = await env.db.prepare(
          'SELECT code, expires_at FROM verify_codes WHERE email = ?'
        ).bind(email).first();

        if (!record) {
          return json({ success: false, message: 'No verification code found. Please request a new one.' });
        }
        if (Date.now() > record.expires_at) {
          await env.db.prepare('DELETE FROM verify_codes WHERE email = ?').bind(email).run();
          return json({ success: false, message: 'This code has expired. Please request a new one.' });
        }
        if (String(record.code) !== String(code).trim()) {
          return json({ success: false, message: 'Incorrect verification code. Please check and try again.' });
        }

        await env.db.prepare('DELETE FROM verify_codes WHERE email = ?').bind(email).run();
        return json({ success: true, message: 'Email verified successfully!' });
      } catch (e) {
        return json({ success: false, message: 'An error occurred while verifying your code.' }, 500);
      }
    }

    // ═══ USER REGISTER ═══
    if (path === '/api/users/register' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password;
        const fullName = body.full_name || '';

        if (!email || !password) {
          return json({ success: false, message: 'Email and password are required.' }, 400);
        }

        const existing = await env.db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existing) {
          return json({ success: false, message: 'This email is already registered. Please log in instead.' }, 409);
        }

        const pwHash = await hashPassword(password);
        const result = await env.db.prepare(
          "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, 'user')"
        ).bind(email, pwHash, fullName).run();

        const user = { id: result.meta.last_row_id, email: email, full_name: fullName, role: 'user' };
        const token = await generateToken(user);

        return json({ success: true, message: 'Account created successfully!', token, user }, 201);
      } catch (e) {
        return json({ success: false, message: 'Registration failed. Please try again.' }, 500);
      }
    }

    // ═══ USER LOGIN ═══
    if (path === '/api/users/login' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password;

        if (!email || !password) {
          return json({ success: false, message: 'Email and password are required.' }, 400);
        }

        const user = await env.db.prepare(
          'SELECT id, email, full_name, role, password_hash FROM users WHERE email = ?'
        ).bind(email).first();

        if (!user) {
          return json({ success: false, message: 'Incorrect email or password.' }, 401);
        }

        const pwHash = await hashPassword(password);
        if (user.password_hash !== pwHash) {
          return json({ success: false, message: 'Incorrect email or password.' }, 401);
        }

        const token = await generateToken({ id: user.id, email: user.email, role: user.role });
        return json({
          success: true, message: 'Login successful!', token,
          user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
        });
      } catch (e) {
        return json({ success: false, message: 'Login failed.' }, 500);
      }
    }

    // ═══ AUTH FOR FORM (auto-create user) ═══
    if (path === '/api/users/auth-for-form' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        if (!email) return json({ success: false, message: 'Email is required.' }, 400);

        let user = await env.db.prepare(
          'SELECT id, email, full_name, role FROM users WHERE email = ?'
        ).bind(email).first();

        if (!user) {
          const pwHash = await hashPassword('auto_form_' + Date.now());
          const result = await env.db.prepare(
            "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, '', 'user')"
          ).bind(email, pwHash).run();
          user = { id: result.meta.last_row_id, email: email, full_name: '', role: 'user' };
        }

        const token = await generateToken(user);
        return json({ success: true, message: 'Authentication successful.', token, user });
      } catch (e) {
        return json({ success: false, message: 'Authentication failed.' }, 500);
      }
    }

    // ═══ GET MY PROFILE ═══
    if (path === '/api/users/me' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const user = await env.db.prepare(
          'SELECT id, email, full_name, role, created_at FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        if (!user) return json({ success: false, message: 'User not found.' }, 404);
        return json({ success: true, user });
      } catch (e) {
        return json({ success: false, message: 'Failed to fetch user.' }, 500);
      }
    }

    // ═══ UPDATE MY PROFILE ═══
    if (path === '/api/users/me' && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const body = await request.json();
        const fullName = body.full_name;
        const email = body.email;

        if (!fullName && !email) {
          return json({ success: false, message: 'At least one field must be provided.' }, 400);
        }

        if (email) {
          const normalizedEmail = email.trim().toLowerCase();
          const existing = await env.db.prepare(
            'SELECT id FROM users WHERE email = ? AND id != ?'
          ).bind(normalizedEmail, authUser.userId).first();
          if (existing) {
            return json({ success: false, message: 'This email is already in use.' }, 409);
          }
          await env.db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(normalizedEmail, authUser.userId).run();
        }

        if (fullName !== undefined) {
          await env.db.prepare('UPDATE users SET full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(fullName.trim(), authUser.userId).run();
        }

        const user = await env.db.prepare(
          'SELECT id, email, full_name, role, created_at, updated_at FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        return json({ success: true, message: 'Profile updated successfully.', user });
      } catch (e) {
        return json({ success: false, message: 'Failed to update profile.' }, 500);
      }
    }

    // ═══ CHANGE PASSWORD ═══
    if (path === '/api/users/change-password' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const body = await request.json();
        const currentPassword = body.currentPassword;
        const newPassword = body.newPassword;

        if (!currentPassword || !newPassword) {
          return json({ success: false, message: 'Current and new password are required.' }, 400);
        }
        if (newPassword.length < 8) {
          return json({ success: false, message: 'New password must be at least 8 characters.' }, 400);
        }

        const stored = await env.db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(authUser.userId).first();
        const curHash = await hashPassword(currentPassword);
        if (stored.password_hash !== curHash) {
          return json({ success: false, message: 'Current password is incorrect.' }, 401);
        }

        const newHash = await hashPassword(newPassword);
        await env.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(newHash, authUser.userId).run();
        return json({ success: true, message: 'Password changed successfully.' });
      } catch (e) {
        return json({ success: false, message: 'Failed to change password.' }, 500);
      }
    }

    // ═══ RESET PASSWORD ═══
    if (path === '/api/users/reset-password' && method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const newPassword = body.newPassword;

        if (!email || !newPassword) {
          return json({ success: false, message: 'Email and new password are required.' }, 400);
        }
        if (newPassword.length < 8) {
          return json({ success: false, message: 'New password must be at least 8 characters.' }, 400);
        }

        const user = await env.db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (!user) {
          return json({ success: false, message: 'No account found with this email address.' }, 404);
        }

        const newHash = await hashPassword(newPassword);
        await env.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?')
          .bind(newHash, email).run();
        return json({ success: true, message: 'Password reset successfully.' });
      } catch (e) {
        return json({ success: false, message: 'Failed to reset password.' }, 500);
      }
    }

    // ═══ MY APPLICATIONS ═══
    if (path === '/api/users/my-applications' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const apps = await env.db.prepare(
          'SELECT * FROM registrations WHERE user_id = ? ORDER BY submitted_at DESC'
        ).bind(authUser.userId).all();
        return json({ success: true, applications: apps.results });
      } catch (e) {
        return json({ success: false, message: 'Failed to load applications.' }, 500);
      }
    }

    // ═══ SUBMIT REGISTRATION ═══
    if (path === '/api/registrations' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const data = await request.json();
        if (!data.team_name || !data.contact_email) {
          return json({ success: false, message: 'Team name and contact email are required.' }, 400);
        }

        const duplicate = await env.db.prepare(
          'SELECT id FROM registrations WHERE contact_email = ?'
        ).bind(data.contact_email.toLowerCase()).first();
        if (duplicate) {
          return json({ success: false, message: 'You have already submitted a registration with this email.' }, 409);
        }

        const result = await env.db.prepare(`
          INSERT INTO registrations (
            user_id, team_name, country, team_size, stage, oneliner,
            contact_name, contact_role, contact_email, contact_phone,
            contact_linkedin, contact_wechat, passport, industry, keywords,
            product_desc, business_model, funded, funding_round,
            funding_amount, investors, ip, cn_funding, cn_cities,
            register_cn, cn_setup, roadmap, support_needed,
            team_members, team_stability, resume, website,
            auth_agree, pitch_deck,
            extra_links, notes, competition_ids, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "pending", )
        `).bind(
          authUser.userId, data.team_name, data.country || '', data.team_size || '',
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

        return json({
          success: true,
          message: 'Registration submitted successfully! We will review and get back to you within 48 hours.',
          registrationId: result.meta.last_row_id
        }, 201);
      } catch (e) {
        return json({ success: false, message: 'Submission failed. Please try again.' }, 500);
      }
    }

    // ═══ LIST REGISTRATIONS (admin) ═══
    if (path === '/api/registrations' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const regs = await env.db.prepare(`
          SELECT r.*, u.full_name as user_full_name
          FROM registrations r LEFT JOIN users u ON r.user_id = u.id
          ORDER BY r.submitted_at DESC
        `).all();
        return json({ success: true, registrations: regs.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ UPDATE REGISTRATION STATUS ═══
    const regStatusMatch = path.match(/^\/api\/registrations\/(\d+)\/status$/);
    if (regStatusMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        const status = body.status;
        if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
          return json({ success: false, message: 'Invalid status.' }, 400);
        }
        await env.db.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(status, regStatusMatch[1]).run();
        return json({ success: true, message: 'Status updated to ' + status + '.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ EDIT REGISTRATION ═══
    const regEditMatch = path.match(/^\/api\/registrations\/(\d+)$/);
    if (regEditMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const regId = regEditMatch[1];
        const reg = await env.db.prepare('SELECT * FROM registrations WHERE id = ?').bind(regId).first();
        if (!reg) return json({ success: false, message: 'Registration not found.' }, 404);
        if (reg.user_id !== authUser.userId && authUser.role !== 'admin') return json({ success: false, message: 'Access denied.' }, 403);
        if (reg.status !== 'pending' && authUser.role !== 'admin') return json({ success: false, message: 'Only pending registrations can be edited.' }, 400);

        const data = await request.json();
        await env.db.prepare(`
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
          data.competition_ids || reg.competition_ids, regId
        ).run();

        const updated = await env.db.prepare('SELECT * FROM registrations WHERE id = ?').bind(regId).first();
        return json({ success: true, message: 'Registration updated.', registration: updated });
      } catch (e) {
        return json({ success: false, message: 'Update failed.' }, 500);
      }
    }

    // ═══ CONCIERGE APPLICATION ═══
    if (path === '/api/concierge' && method === 'POST') {
      const authUser = await getAuthUser(request);

      try {
        const data = await request.json();
        if (!data.company_name || !data.contact_person || !data.email) {
          return json({ success: false, message: 'Company name, contact person, and email are required.' }, 400);
        }

        const result = await env.db.prepare(`
          INSERT INTO concierge_applications (
            user_id, company_name, contact_person, email, phone, whatsapp,
            industry, target_competitions, timeline, budget_range,
            special_requirements, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          authUser ? authUser.userId : null, data.company_name, data.contact_person,
          data.email.toLowerCase(), data.phone || '', data.whatsapp || '',
          Array.isArray(data.industry) ? data.industry.join(', ') : (data.industry || ''),
          Array.isArray(data.target_competitions) ? data.target_competitions.join(', ') : (data.target_competitions || ''),
          data.timeline || '', data.budget_range || '',
          data.special_requirements || '', data.notes || ''
        ).run();

        return json({
          success: true,
          message: 'Concierge request received! We will contact you within 24 hours.',
          applicationId: result.meta.last_row_id
        }, 201);
      } catch (e) {
        return json({ success: false, message: 'Submission failed.' }, 500);
      }
    }

    if (path === '/api/concierge' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const apps = await env.db.prepare('SELECT * FROM concierge_applications ORDER BY created_at DESC').all();
        return json({ success: true, applications: apps.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/concierge/my' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const apps = await env.db.prepare(
          'SELECT * FROM concierge_applications WHERE user_id = ? ORDER BY created_at DESC'
        ).bind(authUser.userId).all();
        return json({ success: true, applications: apps.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ORGANIZER SUBMISSION ═══
    if (path === '/api/organizer-submission' && method === 'POST') {
      try {
        const data = await request.json();
        if (!data.name || !data.city || !data.website || !data.contact || !data.email) {
          return json({ success: false, message: 'All required fields must be filled.' }, 400);
        }

        const result = await env.db.prepare(`
          INSERT INTO organizer_submissions (
            comp_name, city, prize, deadline, industry, website, description,
            contact_name, contact_email, phone, wechat
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.name, data.city || '', data.prize || '', data.deadline || '',
          data.industry || '', data.website, data.description || '',
          data.contact, data.email, data.phone || '', data.wechat || ''
        ).run();

        return json({
          success: true,
          message: 'Thank you! Your competition has been submitted for review.',
          submissionId: result.meta.last_row_id
        }, 201);
      } catch (e) {
        return json({ success: false, message: 'Submission failed.' }, 500);
      }
    }

    // ═══ COMPETITIONS (public) ═══
    if (path === '/api/competitions' && method === 'GET') {
      try {
        const url = new URL(request.url);
        const city = url.searchParams.get('city');
        const featured = url.searchParams.get('featured');

        let query = 'SELECT * FROM competitions ORDER BY sort_order ASC, id ASC';
        let params = [];

        if (city) {
          query = 'SELECT * FROM competitions WHERE city = ? ORDER BY sort_order ASC, id ASC';
          params = [city];
        } else if (featured === 'true') {
          query = 'SELECT * FROM competitions WHERE featured = 1 ORDER BY sort_order ASC, id ASC';
        }

        const result = params.length > 0
          ? await env.db.prepare(query).bind(...params).all()
          : await env.db.prepare(query).all();

        const comps = result.results.map(c => ({
          ...c,
          industries: typeof c.industries === 'string' ? JSON.parse(c.industries || '[]') : (c.industries || []),
          highlights: typeof c.highlights === 'string' ? JSON.parse(c.highlights || '[]') : (c.highlights || [])
        }));

        return json({ success: true, competitions: comps });
      } catch (e) {
        return json({ success: false, message: 'Load failed.' }, 500);
      }
    }

    const compDetailMatch = path.match(/^\/api\/competitions\/(\d+)$/);
    if (compDetailMatch && method === 'GET') {
      try {
        const comp = await env.db.prepare('SELECT * FROM competitions WHERE id = ?').bind(compDetailMatch[1]).first();
        if (!comp) return json({ success: false, message: 'Competition not found.' }, 404);

        comp.industries = typeof comp.industries === 'string' ? JSON.parse(comp.industries || '[]') : (comp.industries || []);
        comp.highlights = typeof comp.highlights === 'string' ? JSON.parse(comp.highlights || '[]') : (comp.highlights || []);
        return json({ success: true, competition: comp });
      } catch (e) {
        return json({ success: false, message: 'Load failed.' }, 500);
      }
    }

    // ═══ ADMIN: COMPETITIONS ═══
    if (path === '/api/admin/competitions' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const result = await env.db.prepare('SELECT * FROM competitions ORDER BY sort_order ASC, id ASC').all();
        const comps = result.results.map(c => ({
          ...c,
          industries: typeof c.industries === 'string' ? JSON.parse(c.industries || '[]') : (c.industries || []),
          highlights: typeof c.highlights === 'string' ? JSON.parse(c.highlights || '[]') : (c.highlights || [])
        }));
        return json({ success: true, competitions: comps });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/admin/competitions' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const d = await request.json();
        const result = await env.db.prepare(`
          INSERT INTO competitions (title, city, deadline, prize, prize_category, industries,
            level, desc, highlights, apply_url, english_url, stage, title_cn, featured, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          d.title, d.city, d.deadline || '', d.prize || '', d.prize_category || '',
          JSON.stringify(d.industries || []), d.level || '', d.desc || '',
          JSON.stringify(d.highlights || []), d.apply_url || '', d.english_url || '',
          d.stage || 'Registration', d.title_cn || '', d.featured ? 1 : 0, d.sort_order || 0
        ).run();
        return json({ success: true, id: result.meta.last_row_id, message: 'Competition added.' }, 201);
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminCompMatch = path.match(/^\/api\/admin\/competitions\/(\d+)$/);
    if (adminCompMatch && method === 'PUT') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const d = await request.json();
        await env.db.prepare(`
          UPDATE competitions SET title=?, city=?, deadline=?, prize=?, prize_category=?,
            industries=?, level=?, desc=?, highlights=?, apply_url=?, english_url=?,
            stage=?, title_cn=?, featured=?, sort_order=?
          WHERE id=?
        `).bind(
          d.title, d.city, d.deadline, d.prize, d.prize_category,
          JSON.stringify(d.industries), d.level, d.desc,
          JSON.stringify(d.highlights), d.apply_url, d.english_url,
          d.stage, d.title_cn, d.featured ? 1 : 0, d.sort_order || 0, adminCompMatch[1]
        ).run();
        return json({ success: true, message: 'Updated.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (adminCompMatch && method === 'DELETE') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        await env.db.prepare('DELETE FROM competitions WHERE id = ?').bind(adminCompMatch[1]).run();
        return json({ success: true, message: 'Deleted.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ SITE CONFIG ═══
    if (path === '/api/config' && method === 'GET') {
      try {
        const rows = await env.db.prepare('SELECT key, value, type FROM site_config').all();
        const config = {};
        rows.results.forEach(r => {
          config[r.key] = r.type === 'boolean' ? (r.value === '1' || r.value === 'true')
                        : r.type === 'number' ? Number(r.value)
                        : r.value;
        });
        return json({ success: true, config });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminConfigMatch = path.match(/^\/api\/admin\/config\/(.+)$/);
    if (adminConfigMatch && method === 'PUT') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        await env.db.prepare(`
          INSERT OR REPLACE INTO site_config (key, value, type, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(adminConfigMatch[1], String(body.value), body.type || 'text').run();
        return json({ success: true, message: "Config '" + adminConfigMatch[1] + "' updated." });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN LOGIN ═══
    if (path === '/api/admin/login' && method === 'POST') {
      try {
        const body = await request.json();
        if (body.username !== ADMIN_USERNAME || body.password !== ADMIN_PASSWORD) {
          return json({ success: false, message: 'Invalid username or password.' }, 401);
        }

        let adminUser = await env.db.prepare("SELECT id, email, role FROM users WHERE role='admin' LIMIT 1").first();
        if (!adminUser) {
          const pwHash = await hashPassword(ADMIN_PASSWORD);
          const result = await env.db.prepare(
            "INSERT INTO users (email, password_hash, full_name, role) VALUES ('admin@competeinchina.com', ?, 'System Administrator', 'admin')"
          ).bind(pwHash).run();
          adminUser = { id: result.meta.last_row_id, email: 'admin@competeinchina.com', role: 'admin' };
        }

        const token = await generateToken(adminUser);
        return json({ success: true, token, user: adminUser });
      } catch (e) {
        return json({ success: false, message: 'Login failed.' }, 500);
      }
    }

    // ═══ ADMIN STATS ═══
    if (path === '/api/admin/stats' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const [totalUsers, totalRegs, pendingRegs, totalConcierge, pendingConcierge, totalComps, activeComps] = await Promise.all([
          env.db.prepare('SELECT COUNT(*) as count FROM users').first(),
          env.db.prepare('SELECT COUNT(*) as count FROM registrations').first(),
          env.db.prepare("SELECT COUNT(*) as count FROM registrations WHERE status='pending'").first(),
          env.db.prepare('SELECT COUNT(*) as count FROM concierge_applications').first(),
          env.db.prepare("SELECT COUNT(*) as count FROM concierge_applications WHERE status='pending'").first(),
          env.db.prepare('SELECT COUNT(*) as count FROM competitions').first(),
          env.db.prepare("SELECT COUNT(*) as count FROM competitions WHERE stage='Registration'").first(),
        ]);

        return json({ success: true, stats: {
          totalUsers: totalUsers.count, totalRegistrations: totalRegs.count,
          pendingRegistrations: pendingRegs.count, totalConcierge: totalConcierge.count,
          pendingConcierge: pendingConcierge.count, totalCompetitions: totalComps.count,
          activeCompetitions: activeComps.count,
        }});
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: USERS ═══
    if (path === '/api/admin/users' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const users = await env.db.prepare(
          'SELECT id, email, full_name, role, created_at, updated_at FROM users ORDER BY created_at DESC'
        ).all();
        return json({ success: true, users: users.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: REGISTRATIONS ═══
    if (path === '/api/admin/registrations' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const regs = await env.db.prepare(
          'SELECT r.*, u.full_name as user_full_name, u.email as user_email FROM registrations r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.submitted_at DESC'
        ).all();
        return json({ success: true, registrations: regs.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminRegStatusMatch = path.match(/^\/api\/admin\/registrations\/(\d+)\/status$/);
    if (adminRegStatusMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        const status = body.status;
        if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
          return json({ success: false, message: 'Invalid status.' }, 400);
        }
        await env.db.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(status, adminRegStatusMatch[1]).run();
        return json({ success: true, message: 'Status updated.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: CONCIERGE ═══
    if (path === '/api/admin/concierge' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const apps = await env.db.prepare('SELECT * FROM concierge_applications ORDER BY created_at DESC').all();
        return json({ success: true, applications: apps.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: ORGANIZER SUBMISSIONS ═══
    if (path === '/api/admin/organizer-submissions' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const subs = await env.db.prepare('SELECT * FROM organizer_submissions ORDER BY created_at DESC').all();
        return json({ success: true, submissions: subs.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminOrgStatusMatch = path.match(/^\/api\/admin\/organizer-submissions\/(\d+)\/status$/);
    if (adminOrgStatusMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        const status = body.status;
        if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
          return json({ success: false, message: 'Invalid status.' }, 400);
        }
        await env.db.prepare('UPDATE organizer_submissions SET status = ? WHERE id = ?').bind(status, adminOrgStatusMatch[1]).run();
        return json({ success: true, message: 'Status updated.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: EXPORT CSV ═══
    if (path === '/api/admin/export/registrations' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const regs = await env.db.prepare('SELECT * FROM registrations ORDER BY submitted_at DESC').all();
        const headers = ['ID', 'Team Name', 'Country', 'Contact Name', 'Contact Email', 'Industry', 'Stage', 'Status', 'Submitted At'];
        const csvRows = [headers.join(',')];

        regs.results.forEach(r => {
          csvRows.push([
            r.id, '"' + (r.team_name || '').replace(/"/g, '""') + '"',
            '"' + (r.country || '').replace(/"/g, '""') + '"',
            '"' + (r.contact_name || '').replace(/"/g, '""') + '"',
            '"' + (r.contact_email || '').replace(/"/g, '""') + '"',
            '"' + (r.industry || '').replace(/"/g, '""') + '"',
            '"' + (r.stage || '').replace(/"/g, '""') + '"',
            r.status, r.submitted_at
          ].join(','));
        });

        return new Response('\uFEFF' + csvRows.join('\n'), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename=registrations.csv',
            ...corsHeaders
          }
        });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: EXPIRING COMPETITIONS ═══
    if (path === '/api/admin/expiring' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
        const today = new Date().toISOString().substring(0, 10);

        const [expiring, expired] = await Promise.all([
          env.db.prepare(
            "SELECT id, title, city, deadline, prize, stage FROM competitions WHERE deadline >= ? AND deadline <= ? AND stage != 'Closed' ORDER BY deadline ASC"
          ).bind(today, sevenDays).all(),
          env.db.prepare(
            "SELECT id, title, city, deadline, prize, stage FROM competitions WHERE deadline < ? AND stage != 'Closed' ORDER BY deadline DESC"
          ).bind(today).all(),
        ]);

        return json({ success: true, expiring: expiring.results, expired: expired.results, today });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/admin/auto-close-expired' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const today = new Date().toISOString().substring(0, 10);
        const result = await env.db.prepare(
          "UPDATE competitions SET stage = 'Closed' WHERE deadline < ? AND stage != 'Closed'"
        ).bind(today).run();
        return json({ success: true, closed: result.meta.changes, date: today });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ TRACKING ═══
    if (path === '/api/tracking/my' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const records = await env.db.prepare(
          'SELECT * FROM competition_tracking WHERE user_id = ? ORDER BY stage_updated_at DESC'
        ).bind(authUser.userId).all();
        return json({ success: true, records: records.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/tracking/request' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const body = await request.json();
        let finalName = body.competition_name;

        if (body.competition_id) {
          const comp = await env.db.prepare('SELECT title FROM competitions WHERE id = ?').bind(body.competition_id).first();
          if (comp) finalName = comp.title;
          else return json({ success: false, message: 'Competition not found in database.' }, 400);
        }
        if (!finalName) return json({ success: false, message: 'Competition name is required.' }, 400);

        const result = await env.db.prepare(
          'INSERT INTO competition_tracking (user_id, competition_name, competition_id, current_stage, notes) VALUES (?, ?, ?, ?, ?)'
        ).bind(authUser.userId, finalName, body.competition_id || null, 'registering',
          body.notes || (body.competition_url ? 'Official URL: ' + body.competition_url : '')).run();

        return json({ success: true, id: result.meta.last_row_id, message: 'Tracking request submitted.' }, 201);
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ ADMIN: TRACKING ═══
    if (path === '/api/admin/tracking' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const records = await env.db.prepare(`
          SELECT t.*, u.email as user_email, u.full_name as user_name
          FROM competition_tracking t JOIN users u ON t.user_id = u.id
          ORDER BY t.updated_at DESC
        `).all();
        return json({ success: true, records: records.results });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/admin/tracking' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        if (!body.user_id || !body.competition_name) return json({ success: false, message: 'User and competition name are required.' }, 400);

        const stage = body.current_stage && TRACKING_STAGES.includes(body.current_stage) ? body.current_stage : 'registering';
        const result = await env.db.prepare(
          'INSERT INTO competition_tracking (user_id, competition_name, competition_id, current_stage, notes) VALUES (?, ?, ?, ?, ?)'
        ).bind(body.user_id, body.competition_name, body.competition_id || null, stage, body.notes || '').run();

        return json({ success: true, id: result.meta.last_row_id, message: 'Tracking record created.' }, 201);
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminTrackMatch = path.match(/^\/api\/admin\/tracking\/(\d+)$/);
    if (adminTrackMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const body = await request.json();
        const existing = await env.db.prepare('SELECT * FROM competition_tracking WHERE id = ?').bind(adminTrackMatch[1]).first();
        if (!existing) return json({ success: false, message: 'Record not found.' }, 404);

        const stage = body.current_stage && TRACKING_STAGES.includes(body.current_stage) ? body.current_stage : existing.current_stage;
        const stageChanged = stage !== existing.current_stage;

        await env.db.prepare(`
          UPDATE competition_tracking SET
            current_stage = ?, notes = ?, competition_name = ?,
            competition_id = ?, stage_updated_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          stage, body.notes !== undefined ? body.notes : existing.notes,
          body.competition_name || existing.competition_name,
          body.competition_id !== undefined ? (body.competition_id || null) : existing.competition_id,
          stageChanged ? new Date().toISOString() : existing.stage_updated_at,
          adminTrackMatch[1]
        ).run();

        return json({ success: true, message: 'Tracking record updated.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (adminTrackMatch && method === 'DELETE') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        await env.db.prepare('DELETE FROM competition_tracking WHERE id = ?').bind(adminTrackMatch[1]).run();
        return json({ success: true, message: 'Tracking record deleted.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/admin/tracking/stats' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const total = await env.db.prepare('SELECT COUNT(*) as c FROM competition_tracking').first();
        const stats = { total: total.c };
        for (const s of TRACKING_STAGES) {
          const r = await env.db.prepare('SELECT COUNT(*) as c FROM competition_tracking WHERE current_stage = ?').bind(s).first();
          stats[s] = r.c;
        }
        return json({ success: true, stats });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ AGREEMENTS ═══
    if (path === '/api/agreements/status' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const sigs = await env.db.prepare(
          'SELECT agreement_type, full_name, signed_at FROM agreement_signatures WHERE user_id = ?'
        ).bind(authUser.userId).all();

        const status = {
          service_agreement: sigs.results.find(s => s.agreement_type === 'service_agreement') || null,
          nda: sigs.results.find(s => s.agreement_type === 'nda') || null,
          marketing_auth: sigs.results.find(s => s.agreement_type === 'marketing_auth') || null
        };
        return json({ success: true, status });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/agreements/sign' && method === 'POST') {
      const authUser = await getAuthUser(request);
      if (!authUser) return json({ success: false, message: 'No token provided or token expired.' }, 401);

      try {
        const body = await request.json();
        if (!body.agreement_type || !['service_agreement', 'nda', 'marketing_auth'].includes(body.agreement_type)) {
          return json({ success: false, message: 'Invalid agreement type.' }, 400);
        }
        if (!body.full_name || !body.full_name.trim()) {
          return json({ success: false, message: 'Full name is required for signature.' }, 400);
        }

        const user = await env.db.prepare('SELECT email FROM users WHERE id = ?').bind(authUser.userId).first();

        const result = await env.db.prepare(`
          INSERT OR REPLACE INTO agreement_signatures (user_id, agreement_type, full_name, email, ip_address, user_agent, signed_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(authUser.userId, body.agreement_type, body.full_name.trim(), user ? user.email : authUser.email || '',
          request.headers.get('CF-Connecting-IP') || '', request.headers.get('User-Agent') || '').run();

        return json({ success: true, id: result.meta.last_row_id, message: 'Agreement signed successfully.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    if (path === '/api/admin/agreements' && method === 'GET') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      try {
        const users = await env.db.prepare('SELECT id, email, full_name FROM users ORDER BY id').all();
        const signatures = await env.db.prepare('SELECT user_id, agreement_type, full_name, signed_at FROM agreement_signatures ORDER BY signed_at DESC').all();

        const userMap = {};
        users.results.forEach(u => {
          userMap[u.id] = { id: u.id, email: u.email, full_name: u.full_name || '', agreements: {} };
        });
        signatures.results.forEach(s => {
          if (userMap[s.user_id]) {
            userMap[s.user_id].agreements[s.agreement_type] = { full_name: s.full_name, signed_at: s.signed_at };
          }
        });

        return json({ success: true, users: Object.values(userMap) });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    const adminAgreementMatch = path.match(/^\/api\/admin\/agreements\/(\d+)\/(.+)$/);
    if (adminAgreementMatch && method === 'DELETE') {
      const authUser = await getAuthUser(request);
      if (!authUser || authUser.role !== 'admin') return json({ success: false, message: 'Admin access required.' }, 403);

      const type = adminAgreementMatch[2];
      if (!['service_agreement', 'nda', 'marketing_auth'].includes(type)) {
        return json({ success: false, message: 'Invalid agreement type.' }, 400);
      }
      try {
        const result = await env.db.prepare(
          'DELETE FROM agreement_signatures WHERE user_id = ? AND agreement_type = ?'
        ).bind(adminAgreementMatch[1], type).run();
        return json({ success: true, deleted: result.meta.changes, message: 'Agreement revoked.' });
      } catch (e) {
        return json({ success: false, message: e.message }, 500);
      }
    }

    // ═══ 404 ═══
    return json({ success: false, message: 'API endpoint not found.' }, 404);
  }
};
