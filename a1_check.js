const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/workspace/competeinchina_a1_hero.png', fullPage: true });
  console.log('Hero + Cards saved.');
  
  // Check SVG exists
  const hasSvg = await page.$eval('.hero-illustration', el => el.innerHTML.length > 100);
  console.log('Hero illustration present:', hasSvg);
  
  const cardIcons = await page.$$eval('.comp-card-icon', els => els.length);
  console.log('Card icons found:', cardIcons);
  
  // Go to How It Works page
  await page.click('.nav-link[data-page="how"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/workspace/competeinchina_a1_how.png', fullPage: true });
  
  const stepSvgs = await page.$$eval('.step-illustration svg', els => els.length);
  console.log('Step illustrations found:', stepSvgs);
  
  await browser.close();
  console.log('Done.');
})();
