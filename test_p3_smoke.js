// P3 UX — Smoke Test
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let ok = 0, fail = 0;

  async function check(name, fn) {
    try { await fn(); console.log('✅ ' + name); ok++; }
    catch(e) { console.log('❌ ' + name + ': ' + e.message); fail++; }
  }

  // Login
  await page.goto('http://localhost:3300/admin.html', { waitUntil: 'networkidle' });
  await page.fill('#adminUser', 'admin');
  await page.fill('#adminPass', 'CompeteInChina2026!');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(1500);

  // Check tabs
  await check('6 tabs visible', async () => {
    const tabs = await page.$$('.tab-btn');
    if (tabs.length !== 6) throw new Error('Expected 6 tabs, got ' + tabs.length);
  });

  // Switch to each tab
  for (const tab of ['Competitions', 'Users', 'Concierge', 'Organizers', '追踪', 'Site Content']) {
    await check(`Tab "${tab}" loads`, async () => {
      await page.click(`.tab-btn:has-text("${tab}")`);
      await page.waitForTimeout(800);
    });
  }

  // Edit a competition
  await page.click('.tab-btn:has-text("Competitions")');
  await page.waitForTimeout(500);
  await check('Click competition in sidebar', async () => {
    const item = await page.$('.list-item');
    if (!item) throw new Error('No list items');
    await item.click();
    await page.waitForTimeout(500);
  });

  await check('Form has 3 sections', async () => {
    const sections = await page.$$('.form-section');
    if (sections.length !== 3) throw new Error('Expected 3 form sections, got ' + sections.length);
  });

  await check('Form has field validation', async () => {
    await page.fill('#fTitle', '');
    await page.waitForTimeout(300);
    const cls = await page.$eval('#fTitle', el => el.className);
    if (!cls.includes('input-error')) throw new Error('No error class on empty title');
  });

  // Save form
  await page.fill('#fTitle', 'Test Competition P3');
  await page.fill('#fPrize', '¥1M');
  await page.fill('#fApplyUrl', 'https://example.com');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(1500);

  await check('Save banner appears', async () => {
    const banner = await page.$('#saveBanner');
    if (!banner) throw new Error('Save banner not found');
  });

  // Check Users tab with search
  await page.click('.tab-btn:has-text("Users")');
  await page.waitForTimeout(800);
  await check('Users search visible', async () => {
    const search = await page.$('#userSearchInput');
    if (!search) throw new Error('User search input not found');
  });

  console.log('\n═══ P3 SMOKE TEST: ' + ok + '/' + (ok+fail) + ' passed ═══');
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})();
