const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/workspace/competeinchina_p1_hero.png', fullPage: true });
  console.log('Hero screenshot saved.');
  
  // Check if all CSS updates are present
  const hasGradient = await page.$eval('.hero', el => el.style.background || getComputedStyle(el).backgroundImage);
  console.log('Hero background:', hasGradient.substring(0, 80));
  
  const btnStyle = await page.$eval('.nav-cta', el => getComputedStyle(el).borderRadius);
  console.log('Nav CTA border-radius:', btnStyle);
  
  const cardHover = await page.$eval('.comp-card', el => getComputedStyle(el).transition);
  console.log('Card transition:', cardHover.substring(0, 60));
  
  const titleSize = await page.$eval('.hero h1', el => getComputedStyle(el).fontSize);
  console.log('Hero h1 font-size:', titleSize);
  
  await browser.close();
  console.log('Done.');
})();
