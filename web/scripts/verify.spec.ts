import { test, expect } from "@playwright/test";

test("verify sources page loads", async ({ page }) => {
  console.log("Navigating to http://localhost:3000/sources...");
  const response = await page.goto("http://localhost:3000/sources", { timeout: 15000 });
  
  console.log(`Status: ${response?.status()}`);
  expect(response?.status()).toBe(200);
  
  const title = await page.title();
  console.log(`Title: ${title}`);
  expect(title).toContain("Distill");
  
  // Take a screenshot to verify
  await page.screenshot({ path: "/Users/socket/.gemini/antigravity/brain/54912c6a-9434-46c0-b29b-941c06e3d6f6/playwright_test_sources.png" });
  console.log("Screenshot saved.");
});

test("verify settings page loads", async ({ page }) => {
  console.log("Navigating to http://localhost:3000/settings...");
  const response = await page.goto("http://localhost:3000/settings", { timeout: 15000 });
  
  console.log(`Status: ${response?.status()}`);
  expect(response?.status()).toBe(200);
  
  // Take a screenshot to verify
  await page.screenshot({ path: "/Users/socket/.gemini/antigravity/brain/54912c6a-9434-46c0-b29b-941c06e3d6f6/playwright_test_settings.png" });
  console.log("Screenshot saved.");
});
