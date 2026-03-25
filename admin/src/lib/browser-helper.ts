import { chromium, Browser, BrowserContext, Page } from "playwright";

/**
 * Standardized browser launch utility for Distill.
 * - Managed Chromium only
 * - Enforced Headless mode
 * - No local Chrome dependency
 */
export async function getStandardBrowser(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  return { browser, context, page };
}

export async function closeStandardBrowser(browser: Browser): Promise<void> {
  await browser.close();
}
