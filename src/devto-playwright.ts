import fs from "fs/promises";
import path from "path";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { Config } from "./config.js";
import { GeneratedArticle } from "./generator.js";

export interface PlaywrightPublishResult {
  articleUrl: string;
  canonicalUrl: string;
  published: boolean;
}

export async function publishToDevToWithPlaywright(
  config: Config,
  article: GeneratedArticle
): Promise<PlaywrightPublishResult> {
  const published = !config.DEVTO_PUBLISH_AS_DRAFT;
  const sessionPath = path.resolve(process.cwd(), config.DEVTO_SESSION_PATH);

  if (config.DRY_RUN) {
    console.log(`[DRY-RUN] Playwright DEV.to publishing simulation:`);
    console.log(`  - Title: ${article.title}`);
    console.log(`  - Canonical URL: ${article.canonicalUrl}`);
    console.log(`  - Published: ${published}`);
    console.log(`  - Tags: ${article.tags.join(", ")}`);
    console.log(`  - Headless: ${config.PLAYWRIGHT_HEADLESS}`);
    return {
      articleUrl: `https://dev.to/simulated-user/${article.slug}-playwright`,
      canonicalUrl: article.canonicalUrl,
      published,
    };
  }

  // Ensure session directory exists
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });

  const hasSavedSession = await fs
    .access(sessionPath)
    .then(() => true)
    .catch(() => false);

  console.log(`Launching Playwright Chromium (Headless: ${config.PLAYWRIGHT_HEADLESS})...`);
  const browser: Browser = await chromium.launch({
    headless: config.PLAYWRIGHT_HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let context: BrowserContext;
  if (hasSavedSession) {
    console.log(`🔑 Loading saved session state from ${sessionPath}...`);
    context = await browser.newContext({ storageState: sessionPath });
  } else {
    context = await browser.newContext();
  }

  const page: Page = await context.newPage();

  try {
    // Check if user is logged in by navigating to /new
    console.log("Navigating to https://dev.to/new...");
    await page.goto("https://dev.to/new", { waitUntil: "networkidle", timeout: 45000 });

    // If redirected to login page (/enter), perform login
    if (page.url().includes("/enter") || page.url().includes("/signin")) {
      console.log("🔐 Not logged in. Attempting authentication...");

      if (!config.DEVTO_EMAIL || !config.DEVTO_PASSWORD) {
        throw new Error(
          "DEV.to session expired or missing, and DEVTO_EMAIL / DEVTO_PASSWORD not provided in .env. Run `npm run devto:login` or configure credentials."
        );
      }

      await page.goto("https://dev.to/enter", { waitUntil: "domcontentloaded" });

      // Fill email & password
      const emailInput = page.locator('input#user_email, input[type="email"], input[name="user[email]"]').first();
      await emailInput.waitFor({ state: "visible", timeout: 15000 });
      await emailInput.fill(config.DEVTO_EMAIL);

      const passwordInput = page.locator('input#user_password, input[type="password"], input[name="user[password]"]').first();
      await passwordInput.fill(config.DEVTO_PASSWORD);

      const submitBtn = page.locator('input[type="submit"][name="commit"], button[type="submit"]').first();
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes("/enter"), { timeout: 30000 }).catch(() => {}),
        submitBtn.click(),
      ]);

      // Save updated session state
      await context.storageState({ path: sessionPath });
      console.log(`✅ Session state saved to ${sessionPath}`);

      await page.goto("https://dev.to/new", { waitUntil: "networkidle" });
    }

    console.log("📝 Filling blog post details in DEV.to editor...");
    await page.waitForTimeout(1500);

    // 1. Fill Title
    const titleLocator = page.locator('textarea#article-form-title, textarea[placeholder*="title" i]').first();
    await titleLocator.waitFor({ state: "visible", timeout: 20000 });
    await titleLocator.fill(article.title);

    // 2. Fill Tags (tag-input: type tag and press Enter)
    const sanitizedTags = article.tags
      .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length > 0)
      .slice(0, 4);

    const tagInput = page.locator('input#tag-input, input#article_tags').first();
    if (await tagInput.isVisible()) {
      for (const tag of sanitizedTags) {
        await tagInput.fill(tag);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      }
    }

    // 3. Fill Markdown Content with Attribution
    const bodyWithAttribution = `${article.markdownContent}

---

*This article was originally published on [${config.TARGET_SITE_URL.replace(/^https?:\/\//, "")}](${article.canonicalUrl}).*
`;

    const bodyLocator = page.locator('textarea#article_body_markdown, textarea[name="body_markdown"]').first();
    await bodyLocator.waitFor({ state: "visible", timeout: 15000 });
    await bodyLocator.fill(bodyWithAttribution);

    // 4. Set Canonical URL in Advanced Options
    console.log(`🎯 Setting Canonical URL to: ${article.canonicalUrl}...`);
    const optionsBtn = page.locator('button#post-options-btn, button:has-text("Advanced Options")').first();

    if (await optionsBtn.isVisible()) {
      await optionsBtn.click();
      await page.waitForTimeout(500);
    }

    const canonicalInput = page.locator('input#canonicalUrl, input[name="canonicalUrl"], input#article_canonical_url').first();
    if (await canonicalInput.isVisible()) {
      await canonicalInput.fill(article.canonicalUrl);
      console.log(`✅ Canonical URL successfully set: ${article.canonicalUrl}`);
    } else {
      console.warn("⚠️ Canonical URL input not visible in drawer directly.");
    }

    // Close options modal via 'Done' button or dismiss button
    console.log("Closing options modal via 'Done' button...");
    const doneBtn = page.locator('.crayons-modal button:has-text("Done"), button.crayons-modal__dismiss').first();
    if (await doneBtn.isVisible()) {
      await doneBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }

    await page.locator(".crayons-modal__backdrop").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 5. Publish or Save Draft
    if (published) {
      console.log("🚀 Publishing article live to DEV.to...");
      const publishBtn = page.locator('button:has-text("Publish"), input[value="Publish"]').first();
      await publishBtn.waitFor({ state: "visible", timeout: 10000 });
      await publishBtn.click();
    } else {
      console.log("💾 Saving article as draft on DEV.to...");
      const draftBtn = page.locator('button:has-text("Save Draft"), button:has-text("Save draft")').first();
      await draftBtn.waitFor({ state: "visible", timeout: 10000 });
      await draftBtn.click();
    }

    // Wait for URL change to the published article
    console.log("Waiting for DEV.to article page navigation...");
    await page.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 30000 }).catch(() => {});
    
    let finalUrl = page.url();

    // If still on /new, check dashboard to retrieve the latest article link
    if (finalUrl.endsWith("/new")) {
      console.log("Checking DEV.to dashboard for published post link...");
      await page.goto("https://dev.to/dashboard", { waitUntil: "networkidle" });
      const recentLink = await page.locator("a").evaluateAll((els) =>
        els.map((a) => (a as any).href).find((href) => href && href.includes("/feleona_voice/") && !href.includes("/dashboard"))
      );
      if (recentLink) {
        finalUrl = recentLink;
      }
    }

    console.log(`🎉 DEV.to finished! Page URL: ${finalUrl}`);

    // Update session state
    await context.storageState({ path: sessionPath }).catch(() => {});

    return {
      articleUrl: finalUrl,
      canonicalUrl: article.canonicalUrl,
      published,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
