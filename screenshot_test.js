const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3300', { waitUntil: 'networkidle' });
  
  await page.screenshot({ path: '/workspace/competeinchina_screenshot.png', fullPage: true });
  
  // Click first card
  const cards = await page.$$('.comp-card');
  if (cards.length > 0) {
    await cards[0].click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/workspace/competeinchina_modal.png', fullPage: false });
    
    // Get modal content
    const modalEl = await page.$('#modalOverlay');
    if (modalEl) {
      const modalHtml = await modalEl.innerHTML();
      console.log('=== MODAL HTML ===');
      console.log(modalHtml.substring(0, 4000));
    }
  }
  
  // Full page check
  const html = await page.content();
  console.log('\n=== KEY CHECKS ===');
  console.log('Has "Quick Apply":', html.includes('Quick Apply'));
  console.log('Has "Apply on Official Site":', html.includes('Apply on Official Site'));
  console.log('Has "Let Us Apply for You":', html.includes('Let Us Apply for You'));
  
  // All clickable buttons
  const buttons = await page.$$eval('button, a.btn, .btn-primary, .btn-secondary', els => 
    els.map(el => ({ text: el.textContent.trim().substring(0,60), tag: el.tagName, class: el.className?.substring(0,40) }))
  );
  console.log('\n=== ALL BUTTONS ===');
  buttons.forEach(b => console.log(`  [${b.tag}] "${b.text}"`));
  
  await browser.close();
  console.log('\nDone.');
})();
