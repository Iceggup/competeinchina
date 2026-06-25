const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Admin Competitions tab
  await page.goto('http://localhost:3300/admin.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/workspace/competeinchina_p3_competitions.png', fullPage: false });
  console.log('1. Competitions tab captured');

  // 2. Admin Registrations tab
  await page.click('.tab-btn:nth-child(2)');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/competeinchina_p3_registrations.png', fullPage: false });
  console.log('2. Registrations tab captured');

  // 3. Admin Concierge tab
  await page.click('.tab-btn:nth-child(3)');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/competeinchina_p3_concierge.png', fullPage: false });
  console.log('3. Concierge tab captured');

  // 4. Admin Site Content tab
  await page.click('.tab-btn:nth-child(4)');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/competeinchina_p3_content.png', fullPage: false });
  console.log('4. Site Content tab captured');

  // 5. Check CMS dynamic loading on frontend
  await page.goto('http://localhost:3300/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const heroTitle = await page.$eval('[data-i18n="hero_title"]', el => el.textContent.trim());
  console.log('5. Frontend Hero title:', heroTitle);

  await browser.close();
  console.log('All screenshots saved.');
})();
