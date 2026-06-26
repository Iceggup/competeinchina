// P3 — Agreement Sign + Admin Download E2E Test (API-driven)
const BASE = 'http://localhost:3300';

(async () => {
  let ok = 0, fail = 0;
  const log = [];

  function record(name, status, detail) {
    const icon = status === 'PASS' ? '✅' : '❌';
    log.push({ name, status, detail });
    console.log(icon + ' ' + name + (detail ? ' — ' + detail : ''));
    if (status === 'PASS') ok++; else fail++;
  }

  async function apiPost(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: resp.status, data: await resp.json().catch(() => ({})) };
  }

  async function apiGet(path, token) {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(BASE + path, { headers });
    return { status: resp.status, data: await resp.json().catch(() => ({})) };
  }

  try {
    const testEmail = 'test_agreement_' + Date.now() + '@competeinchina.com';
    const testPass = 'Test1234!';
    let userId, userToken, adminToken;

    // ═══ STEP 1: Register user via API ═══
    console.log('\n═══ STEP 1: Register User ═══');
    const r1 = await apiPost('/api/users/register', { email: testEmail, password: testPass, full_name: 'Test Agreement User' });
    record('User registration', r1.data.success ? 'PASS' : 'FAIL', r1.data.message || r1.status);

    // ═══ STEP 2: Login ═══
    console.log('\n═══ STEP 2: User Login ═══');
    const r2 = await apiPost('/api/users/login', { email: testEmail, password: testPass });
    userToken = r2.data.token;
    userId = r2.data.user?.id;
    record('User login', userToken ? 'PASS' : 'FAIL', userId ? 'id=' + userId : '');

    if (!userToken) throw new Error('Cannot proceed — no user token');

    // ═══ STEP 3: Sign all 3 agreements ═══
    console.log('\n═══ STEP 3: Sign Agreements ═══');
    const agreements = [
      { type: 'service_agreement', label: 'Service Agreement' },
      { type: 'nda', label: 'NDA' },
      { type: 'marketing_auth', label: 'Marketing Authorization' }
    ];

    for (const ag of agreements) {
      const r = await apiPost('/api/agreements/sign', {
        agreement_type: ag.type,
        full_name: 'Test Agreement User',
        ip_address: '127.0.0.1'
      }, userToken);
      record('Sign ' + ag.label, r.data.success ? 'PASS' : 'FAIL', r.data.message || r.status);
    }

    // ═══ STEP 4: Admin login ═══
    console.log('\n═══ STEP 4: Admin Login ═══');
    const r4 = await apiPost('/api/admin/login', { username: 'admin', password: 'CompeteInChina2026!' });
    adminToken = r4.data.token;
    record('Admin login', adminToken ? 'PASS' : 'FAIL');

    if (!adminToken) throw new Error('Cannot proceed — no admin token');

    // ═══ STEP 5: Admin checks agreements list ═══
    console.log('\n═══ STEP 5: Admin Views Agreements ═══');
    const r5 = await apiGet('/api/admin/agreements/all', adminToken);
    const userAgs = (r5.data.agreements || []).filter(a => a.user_id === userId);
    record('Admin sees all 3 agreements', userAgs.length === 3 ? 'PASS' : 'FAIL',
      userAgs.length + ' of 3 for user ' + userId);

    // ═══ STEP 6: Download each agreement PDF ═══
    console.log('\n═══ STEP 6: Download Agreement PDFs ═══');
    for (const ag of agreements) {
      const resp = await fetch(BASE + '/api/admin/agreements/' + userId + '/' + ag.type + '/pdf', {
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
      const body = await resp.text();
      const bodyLen = body.length;

      const isOK = resp.status === 200 && bodyLen > 100;
      record('Download ' + ag.label + ' PDF', isOK ? 'PASS' : 'FAIL',
        'HTTP ' + resp.status + ' | ' + bodyLen + ' bytes | type=' + resp.headers.get('content-type'));

      if (isOK) {
        const hasContent = body.includes('Test User') || body.includes('Test Agreement User') || body.includes('E2E');
        const hasAgreementType = body.toLowerCase().includes(ag.type.replace(/_/g, ' '));
        record('  PDF content valid', (hasContent || hasAgreementType) ? 'PASS' : 'FAIL',
          'hasSignature=' + hasContent + ' hasAgreementRef=' + hasAgreementType);
      }
    }

    // ═══ STEP 7: Verify agreement_signatures table ═══
    console.log('\n═══ STEP 7: Database Verification ═══');
    const db = require('better-sqlite3')('/workspace/competeinchina/db/competeinchina.db');
    const sigCount = db.prepare('SELECT count(*) c FROM agreement_signatures WHERE user_id = ?').get(userId);
    record('DB has 3 signatures for user', sigCount.c === 3 ? 'PASS' : 'FAIL', sigCount.c + ' records');
    db.close();

  } catch (e) {
    console.error('\n❌ FATAL:', e.message);
    record('FATAL ERROR', 'FAIL', e.message);
  }

  // ═══ FINAL REPORT ═══
  console.log('\n' + '═'.repeat(60));
  console.log('📊 AGREEMENT E2E RESULTS: ' + ok + ' passed, ' + fail + ' failed, ' + (ok+fail) + ' total');
  console.log('═'.repeat(60));
  log.forEach(r => console.log((r.status === 'PASS' ? '✅' : '❌') + ' ' + r.name + (r.detail ? ' — ' + r.detail : '')));
  process.exit(fail > 0 ? 1 : 0);
})();
