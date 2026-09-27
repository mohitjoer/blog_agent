import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import dotenv from "dotenv";

dotenv.config();

const SESSION_PATH = path.resolve(process.cwd(), process.env.DEVTO_SESSION_PATH || ".auth/devto-session.json");

async function loginInteractive() {
  console.log("==================================================");
  console.log("🔑 DEV.to Playwright Interactive Login Helper");
  console.log("==================================================");
  console.log("A browser window will now open.");
  console.log("Log into your DEV.to account (via Email, GitHub, Google, etc.).");
  console.log("Once logged in, your session state will be automatically saved.");
  console.log("==================================================\n");

  await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://dev.to/enter");

  console.log("Waiting for successful login on DEV.to...");

  // Wait until user is logged in (navigates away from enter/signin or profile icon is visible)
  await page.waitForFunction(() => {
    return (
      !window.location.pathname.includes("/enter") &&
      !window.location.pathname.includes("/signin") &&
      !window.location.pathname.includes("/login")
    );
  }, { timeout: 180000 });

  console.log("✅ Detected successful login!");
  await page.waitForTimeout(2000);

  await context.storageState({ path: SESSION_PATH });
  console.log(`🎉 Session successfully saved to: ${SESSION_PATH}`);
  console.log("You can now run automated publishing with Playwright in headless mode!");

  await browser.close();
}

loginInteractive().catch((err) => {
  console.error("❌ Login helper failed:", err);
  process.exit(1);
});
