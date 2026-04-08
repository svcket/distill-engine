/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://open.spotify.com/episode/5NjJAcE3f0DBP5bkJIdwUF');
  const title = await page.title();
  console.log('Title:', title);
  await browser.close();
})();
