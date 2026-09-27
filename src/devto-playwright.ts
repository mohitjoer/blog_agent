import fs from "fs/promises";
import path from "path";
import { chromium, Browser, BrowserContext, Locator, Page } from "playwright";
import { Config } from "./config.js";
import { GeneratedArticle } from "./generator.js";

export interface PlaywrightPublishResult {
  articleUrl: string;
  canonicalUrl: string;
  published: boolean;
}

const TITLE_FIELD = 'textarea#article-form-title, textarea[placeholder*="title" i]';
const SIGNIN_FORM = 'input#user_email, input[name="user[email]"], input[type="email"]';
const TAG_OPTION = ".c-autocomplete--multi__tag-option";
const TAG_CHIP = "#combo-selected li:not(:has(input))";

/**
 * DEV.to's editor is a controlled Preact form. `fill()` sets the DOM value without
 * updating its store (the title is then dropped server-side as "title can't be blank"),
 * so text fields must be typed with real key events. The editor also swallows the first
 * keystrokes while it is still settling, so every typed value is verified and retyped.
 */
async function typeInto(locator: Locator, text: string, label: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await locator.click();
    await locator.waitFor({ state: "visible" });
    await locator.press("ControlOrMeta+a").catch(() => {});
    await locator.press("Delete").catch(() => {});
    await locator.pressSequentially(text, { delay: 15 });

    const value = await locator.inputValue().catch(() => "");
    if (value === text) return;
    console.warn(`⚠️ ${label} typing incomplete (attempt ${attempt}): got "${value}"`);
  }
  throw new Error(`Failed to type into ${label} after 3 attempts (DEV.to editor dropped keystrokes).`);
}

async function addTag(page: Page, tag: string): Promise<void> {
  const tagInput = page.locator("input#tag-input, input#article_tags").first();
  const chipCount = async () => page.locator(TAG_CHIP).count();

  const before = await chipCount();
  await typeInto(tagInput, tag, "tag input");
  await page.waitForTimeout(700);

  // A comma commits the typed tag; Enter alone does not register with the widget.
  await page.keyboard.press(",");
  await page.waitForTimeout(500);

  if ((await chipCount()) <= before) {
    // Fall back to picking the first autocomplete suggestion.
    const option = page.locator(TAG_OPTION).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      await page.waitForTimeout(400);
    }
  }
}

export async function ensureAuthenticated(
  page: Page,
  context: BrowserContext,
  config: Config,
  sessionPath: string
): Promise<void> {
  if (!(await page.locator(SIGNIN_FORM).first().isVisible().catch(() => false))) {
    return;
  }

  console.log("🔐 Not logged in (DEV.to sign-in form detected on /new). Attempting authentication...");

  if (!config.DEVTO_EMAIL || !config.DEVTO_PASSWORD) {
    throw new Error(
      "DEV.to session expired or missing, and DEVTO_EMAIL / DEVTO_PASSWORD not provided. " +
        "Set the secrets or run `npm run devto:login` locally to refresh .auth/devto-session.json."
    );
  }

  const emailInput = page.locator('input#user_email, input[name="user[email]"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(config.DEVTO_EMAIL);

  const passwordInput = page.locator('input#user_password, input[type="password"]').first();
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.fill(config.DEVTO_PASSWORD);

  const form = page.locator("#sign-in-password-form, form[action*='sign_in']").first();
  const submitBtn = form.locator('input[type="submit"][name="commit"], button[type="submit"]').first();
  await submitBtn.click();

  // DEV.to redirects to /new?signin=true and then swaps the form for the editor.
  await page.locator(TITLE_FIELD).first().waitFor({ state: "visible", timeout: 30000 });
  console.log("✅ Signed in to DEV.to.");
  await context.storageState({ path: sessionPath });
  console.log(`🔑 Session state saved to ${sessionPath}`);

  // Reload clean editor (drops the ?signin=true query).
  await page.goto("https://dev.to/new", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator(TITLE_FIELD).first().waitFor({ state: "visible", timeout: 30000 });
}

async function dumpDiagnostics(page: Page, label: string): Promise<void> {
  const dir = path.resolve(process.cwd(), ".auth/debug");
  try {
    await fs.mkdir(dir, { recursive: true });
    const stamp = `${label}-${Date.now()}`;
    const shot = path.join(dir, `${stamp}.png`);
    const html = path.join(dir, `${stamp}.html`);
    await page.screenshot({ path: shot, fullPage: true });
    await fs.writeFile(html, await page.content(), "utf-8");
    console.error(`🩺 Diagnostics saved: ${shot} and ${html} (page URL: ${page.url()})`);
  } catch (err) {
    console.error("🩺 Failed to write diagnostics:", err);
  }
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
    console.log("Navigating to https://dev.to/new...");
    await page.goto("https://dev.to/new", { waitUntil: "domcontentloaded", timeout: 45000 });

    // DEV.to serves the sign-in form *in place* on /new (URL stays /new), so auth state
    // must be detected from the DOM, not from the URL.
    await ensureAuthenticated(page, context, config, sessionPath);

    console.log("📝 Filling blog post details in DEV.to editor...");

    // 1. Fill Title (must be typed, not filled — see typeInto)
    const titleLocator = page.locator(TITLE_FIELD).first();
    await titleLocator.waitFor({ state: "visible", timeout: 20000 });
    await typeInto(titleLocator, article.title.replace(/\s+/g, " ").trim(), "title field");

    // 2. Fill Tags (tag-input widget: type, then commit with a comma)
    const sanitizedTags = article.tags
      .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((t) => t.length > 0)
      .slice(0, 4);

    const tagInput = page.locator("input#tag-input, input#article_tags").first();
    if (await tagInput.isVisible()) {
      for (const tag of sanitizedTags) {
        await addTag(page, tag);
      }
      const applied = await page.locator(TAG_CHIP).count();
      if (applied < sanitizedTags.length) {
        console.warn(`⚠️ Only ${applied}/${sanitizedTags.length} tags were accepted by DEV.to.`);
      } else {
        console.log(`🏷️ Applied ${applied} tags: ${sanitizedTags.join(", ")}`);
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
    // Net-zero keystroke so the editor's store syncs with the filled value.
    await bodyLocator.press("End");
    await page.keyboard.press(" ");
    await page.keyboard.press("Backspace");

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

      // Some editor revisions ask for a second confirmation before going live.
      const confirmBtn = page
        .locator('button:has-text("Publish now"), .crayons-modal button:has-text("Publish")')
        .first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log("Confirming publish dialog...");
        await confirmBtn.click();
      }
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
      await page.goto("https://dev.to/dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      const recentLink = await page.locator("a").evaluateAll((els, username) => {
        const candidates = els
          .map((a) => (a as HTMLAnchorElement).getAttribute("href") || "")
          .filter((href) => /^\/[a-z0-9_-]+\/[a-z0-9][a-z0-9-]*$/i.test(href))
          .filter((href) => !href.startsWith("/dashboard"))
          .filter((href) => !href.endsWith("/series"));
        if (username) {
          const mine = candidates.find((href) => href.startsWith(`/${username}/`));
          if (mine) return mine;
        }
        return candidates[0];
      }, config.DEVTO_USERNAME || "");
      if (recentLink) {
        finalUrl = new URL(recentLink, "https://dev.to").toString();
      }
    }

    console.log(`🎉 DEV.to finished! Page URL: ${finalUrl}`);

    // Drop preview query strings DEV.to appends for drafts.
    finalUrl = finalUrl.split("?")[0].split("#")[0];

    // Update session state
    await context.storageState({ path: sessionPath }).catch(() => {});

    return {
      articleUrl: finalUrl,
      canonicalUrl: article.canonicalUrl,
      published,
    };
  } catch (err) {
    await dumpDiagnostics(page, "devto-publish-failed");
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}
