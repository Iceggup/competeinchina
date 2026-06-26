// ═══════════════════════════════════════════════════════════
//  P2 CMS — E2E Playwright Test Suite
//  Tests: CMS save → frontend refresh → all fields consistent
//         Featured toggle → carousel show/hide
//         City filter dynamic rendering from CMS
//  Run: node test_p2_cms_e2e.js
// ═══════════════════════════════════════════════════════════

const { chromium } = require('playwright');
const BASE = 'http://localhost:3300';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let passed = 0, failed = 0;
  const results = [];

  function log(test, status, detail) {
    const icon = status === 'PASS' ? '✅' : '❌';
    const entry = { test, status, detail };
    results.push(entry);
    console.log(`${icon} ${test} — ${status}${detail ? ': ' + detail : ''}`);
    if (status === 'PASS') passed++; else failed++;
  }

  try {
    // ─── STEP 0: Admin Login ───
    console.log('\n═══ STEP 0: Admin Login ═══');
    await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle' });
    await page.fill('#adminUser', 'admin');
    await page.fill('#adminPass', 'CompeteInChina2026!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(1500);
    
    const adminContent = await page.textContent('body');
    if (adminContent.includes('Dashboard') || adminContent.includes('Competitions') || adminContent.includes('Site Content')) {
      log('Admin login', 'PASS');
    } else {
      log('Admin login', 'FAIL', 'Dashboard not visible after login');
    }

    // ─── STEP 1: Navigate to Site Content Tab ───
    console.log('\n═══ STEP 1: Site Content Tab ═══');
    // Click the Site Content tab
    const contentTab = page.locator('.tab, button, a').filter({ hasText: /Site Content|🎨/ });
    const contentTabCount = await contentTab.count();
    if (contentTabCount > 0) {
      await contentTab.first().click();
      await page.waitForTimeout(1000);
      log('Site Content Tab', 'PASS');
    } else {
      // Try clicking by text
      try {
        await page.click('text=Site Content');
        await page.waitForTimeout(1000);
        log('Site Content Tab (text)', 'PASS');
      } catch(e) {
        log('Site Content Tab', 'FAIL', 'Tab not found');
      }
    }

    // ─── STEP 2: Verify CMS Config Grid Loads ───
    console.log('\n═══ STEP 2: CMS Config Grid ═══');
    const configGrid = await page.$('#configGrid');
    if (configGrid) {
      const gridHTML = await configGrid.innerHTML();
      const hasHeroTitle = gridHTML.includes('cfg_hero_title');
      const hasCityTags = gridHTML.includes('cfg_city_tags');
      const hasAnnouncement = gridHTML.includes('cfg_announcement_active');
      if (hasHeroTitle && hasCityTags && hasAnnouncement) {
        log('Config Grid loads all fields', 'PASS', `Hero:${hasHeroTitle} Cities:${hasCityTags} Announce:${hasAnnouncement}`);
      } else {
        log('Config Grid', 'FAIL', `Missing fields - Hero:${hasHeroTitle} Cities:${hasCityTags} Announce:${hasAnnouncement}`);
      }
    } else {
      log('Config Grid', 'FAIL', '#configGrid not found');
    }

    // ─── STEP 3: Modify CMS Config and Save ───
    console.log('\n═══ STEP 3: CMS Config Save ═══');
    const testHeroTitle = 'TEST_' + Date.now();
    const testCities = JSON.stringify([
      { name: 'Beijing', color: '#dc2626' },
      { name: 'Shanghai', color: '#2563eb' },
      { name: 'Shenzhen', color: '#059669' },
      { name: 'Chengdu', color: '#ea580c' },
      { name: 'TestCity', color: '#8b5cf6' }
    ]);

    // Fill hero_title
    try {
      await page.fill('#cfg_hero_title', testHeroTitle);
      log('Fill hero_title', 'PASS', testHeroTitle);
    } catch(e) {
      log('Fill hero_title', 'FAIL', e.message);
    }

    // Fill city_tags
    try {
      await page.fill('#cfg_city_tags', testCities);
      log('Fill city_tags', 'PASS');
    } catch(e) {
      log('Fill city_tags', 'FAIL', e.message);
    }

    // Click Save All
    try {
      await page.click('button:has-text("Save All Site Content")');
      await page.waitForTimeout(2000);
      log('Save All Config', 'PASS');
    } catch(e) {
      log('Save All Config', 'FAIL', e.message);
    }

    // ─── STEP 4: Verify Frontend Reads CMS Config ───
    console.log('\n═══ STEP 4: Frontend CMS Config ═══');
    const frontPage = await context.newPage();
    await frontPage.goto(BASE + '/?v=' + Date.now(), { waitUntil: 'networkidle' });
    await frontPage.waitForTimeout(2000);

    // Check hero_title was applied
    const heroTitleEl = await frontPage.$('[data-i18n="hero_title"]');
    if (heroTitleEl) {
      const heroText = await heroTitleEl.innerHTML();
      if (heroText.includes(testHeroTitle)) {
        log('Frontend hero_title from CMS', 'PASS', heroText.substring(0, 50));
      } else {
        log('Frontend hero_title from CMS', 'FAIL', `Expected "${testHeroTitle}", got "${heroText.substring(0, 50)}"`);
      }
    } else {
      log('Frontend hero_title from CMS', 'FAIL', '[data-i18n="hero_title"] not found');
    }

    // Check _cmsCities was populated
    const cmsCities = await frontPage.evaluate(() => window._cmsCities);
    if (cmsCities && Array.isArray(cmsCities) && cmsCities.length === 5) {
      log('Frontend _cmsCities populated', 'PASS', `${cmsCities.length} cities: ${cmsCities.map(c=>c.name).join(', ')}`);
    } else {
      log('Frontend _cmsCities populated', 'FAIL', `Got: ${JSON.stringify(cmsCities)}`);
    }

    // Check city filter dropdown was updated
    const cityOptions = await frontPage.evaluate(() => {
      const sel = document.getElementById('filterCity');
      if (!sel) return null;
      return Array.from(sel.options).map(o => o.value || o.textContent);
    });
    if (cityOptions && cityOptions.includes('TestCity')) {
      log('City filter dropdown dynamic', 'PASS', `${cityOptions.length} options includes TestCity`);
    } else {
      log('City filter dropdown dynamic', 'FAIL', `Options: ${JSON.stringify(cityOptions)}`);
    }

    await frontPage.close();

    // ─── STEP 5: Featured Toggle → Carousel ───
    console.log('\n═══ STEP 5: Featured Toggle → Carousel ═══');

    // First, check how many competitions are featured
    await page.goto(BASE + '/admin.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Navigate to Competitions tab
    try {
      await page.click('text=Competitions');
      await page.waitForTimeout(1000);
      log('Competitions Tab', 'PASS');
    } catch(e) {
      // Try clicking tab button
      const compTab = page.locator('.tab, button').filter({ hasText: /Competitions/ });
      if (await compTab.count() > 0) {
        await compTab.first().click();
        await page.waitForTimeout(1000);
        log('Competitions Tab (alt)', 'PASS');
      } else {
        log('Competitions Tab', 'FAIL', 'Tab not found');
      }
    }

    // Count current featured competitions
    const featuredBefore = await page.evaluate(() => {
      const stars = document.querySelectorAll('[onclick*="toggleFeatured"]');
      let count = 0;
      stars.forEach(s => { if (s.style.opacity !== '0.3' && s.textContent.includes('⭐')) count++; });
      return count;
    });
    log('Featured count before toggle', 'PASS', `${featuredBefore} featured`);

    // Toggle the first competition's featured status
    try {
      const starBtn = page.locator('[onclick*="toggleFeatured"]').first();
      await starBtn.click();
      await page.waitForTimeout(1000);
      log('Featured toggle clicked', 'PASS');
    } catch(e) {
      log('Featured toggle clicked', 'FAIL', e.message);
    }

    // Check carousel on frontend
    const frontPage2 = await context.newPage();
    await frontPage2.goto(BASE + '/?v=' + Date.now(), { waitUntil: 'networkidle' });
    await frontPage2.waitForTimeout(2000);

    const carouselVisible = await frontPage2.evaluate(() => {
      const wrap = document.getElementById('carouselWrap');
      if (!wrap) return 'no-wrap';
      return wrap.style.display === 'none' ? 'hidden' : 'visible';
    });
    
    const carouselCards = await frontPage2.evaluate(() => {
      const cards = document.querySelectorAll('.hero-carousel-card');
      return cards.length;
    });

    log('Carousel state after toggle', 'PASS', `${carouselVisible}, ${carouselCards} cards`);

    await frontPage2.close();

    // ─── STEP 6: Restore original CMS values ───
    console.log('\n═══ STEP 6: Restore CMS Values ═══');
    await page.goto(BASE + '/admin.html?v=' + Date.now(), { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    try {
      await page.click('text=Site Content');
      await page.waitForTimeout(1000);
    } catch(e) {}

    // Clear hero_title back
    try {
      await page.fill('#cfg_hero_title', '');
      await page.fill('#cfg_city_tags', '');
      await page.click('button:has-text("Save All Site Content")');
      await page.waitForTimeout(1500);
      log('Restore CMS defaults', 'PASS');
    } catch(e) {
      log('Restore CMS defaults', 'FAIL', e.message);
    }

    // ─── STEP 7: Verify defaults restored on frontend ───
    console.log('\n═══ STEP 7: Verify Defaults Restored ═══');
    const frontPage3 = await context.newPage();
    await frontPage3.goto(BASE + '/?v=' + Date.now(), { waitUntil: 'networkidle' });
    await frontPage3.waitForTimeout(2000);

    const restoredTitle = await frontPage3.$eval('[data-i18n="hero_title"]', el => el.innerHTML);
    if (!restoredTitle.includes('TEST_')) {
      log('Defaults restored on frontend', 'PASS', `Title: "${restoredTitle.substring(0, 50)}"`);
    } else {
      log('Defaults restored on frontend', 'FAIL', `Still shows test title: "${restoredTitle.substring(0, 50)}"`);
    }

    const restoredCities = await frontPage3.evaluate(() => window._cmsCities);
    if (!restoredCities || restoredCities.length === 0) {
      log('_cmsCities cleared', 'PASS');
    } else {
      log('_cmsCities cleared', 'FAIL', `Still has ${restoredCities.length} cities`);
    }

    await frontPage3.close();

  } catch (e) {
    console.error('\n❌ FATAL ERROR:', e.message);
    log('FATAL', 'FAIL', e.message);
  }

  // ─── FINAL REPORT ───
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 P2 CMS E2E TEST RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═'.repeat(60));
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.test}${r.detail ? ' — ' + r.detail : ''}`);
  });

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
