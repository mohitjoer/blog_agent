import assert from "node:assert";
import { loadConfig } from "../src/config.js";
import { generateBlogPost } from "../src/generator.js";
import { createNextJsBlogPR } from "../src/github.js";
import { publishToDevTo } from "../src/devto.js";
import { publishToDevToWithPlaywright } from "../src/devto-playwright.js";

async function runTests() {
  console.log("🧪 Running Blog Agent Workflow Unit Tests...\n");

  // Test 1: Config loading with dry-run fallback
  console.log("1. Testing config loading with DRY_RUN mode...");
  const config = loadConfig({ DRY_RUN: true, GEMINI_API_KEY: "mock-gemini-key" });
  assert.strictEqual(config.DRY_RUN, true, "Config should enable DRY_RUN");
  assert.ok(config.TARGET_SITE_URL, "TARGET_SITE_URL should have a value");
  console.log("   ✅ Config loaded successfully.\n");

  // Test 1b: Single JSON variable parsing for TARGET_REPO_CONFIG
  console.log("1b. Testing TARGET_REPO_CONFIG JSON parsing...");
  const prevJsonEnv = process.env.TARGET_REPO_CONFIG;
  process.env.TARGET_REPO_CONFIG = JSON.stringify({
    pat: "ghp_json_test_token",
    owner: "json-owner",
    name: "json-repo",
    blogDir: "posts/custom",
    fileExt: "md",
    baseBranch: "develop",
    blogBranch: "custom-blog-branch",
  });
  // Clear any overriding env vars temporarily for the test
  const prevPat = process.env.TARGET_REPO_PAT;
  delete process.env.TARGET_REPO_PAT;
  const jsonLoadedConfig = loadConfig({ DRY_RUN: true });
  assert.strictEqual(jsonLoadedConfig.TARGET_REPO_PAT, "ghp_json_test_token");
  assert.strictEqual(jsonLoadedConfig.TARGET_REPO_OWNER, "json-owner");
  assert.strictEqual(jsonLoadedConfig.TARGET_REPO_NAME, "json-repo");
  assert.strictEqual(jsonLoadedConfig.TARGET_BLOG_DIR, "posts/custom");
  assert.strictEqual(jsonLoadedConfig.TARGET_FILE_EXT, "md");
  assert.strictEqual(jsonLoadedConfig.TARGET_BASE_BRANCH, "develop");
  assert.strictEqual(jsonLoadedConfig.TARGET_BLOG_BRANCH, "custom-blog-branch");
  // Restore
  if (prevJsonEnv) process.env.TARGET_REPO_CONFIG = prevJsonEnv; else delete process.env.TARGET_REPO_CONFIG;
  if (prevPat) process.env.TARGET_REPO_PAT = prevPat;
  console.log("   ✅ TARGET_REPO_CONFIG JSON parsing passed.\n");

  // Test 1c: Single-quoted JSON string (common when pasting in GitHub Secrets or .env)
  console.log("1c. Testing single-quoted TARGET_REPO_CONFIG parsing...");
  process.env.TARGET_REPO_CONFIG = `'{"owner":"quote-owner","name":"quote-repo","pat":"ghp_quote_pat"}'`;
  delete process.env.TARGET_REPO_PAT;
  delete process.env.TARGET_REPO_OWNER;
  delete process.env.TARGET_REPO_NAME;
  const quoteLoadedConfig = loadConfig({ DRY_RUN: true });
  assert.strictEqual(quoteLoadedConfig.TARGET_REPO_OWNER, "quote-owner");
  assert.strictEqual(quoteLoadedConfig.TARGET_REPO_NAME, "quote-repo");
  assert.strictEqual(quoteLoadedConfig.TARGET_REPO_PAT, "ghp_quote_pat");
  if (prevJsonEnv) process.env.TARGET_REPO_CONFIG = prevJsonEnv; else delete process.env.TARGET_REPO_CONFIG;
  if (prevPat) process.env.TARGET_REPO_PAT = prevPat;
  console.log("   ✅ Single-quoted TARGET_REPO_CONFIG parsing passed.\n");

  // Test 2: Article generation
  console.log("2. Testing article generator...");
  const article = await generateBlogPost(config, "TypeScript Clean Architecture");
  assert.ok(article.title.length > 0, "Title should not be empty");
  assert.ok(article.slug.length > 0, "Slug should not be empty");
  assert.ok(article.canonicalUrl.startsWith(config.TARGET_SITE_URL), "Canonical URL must match target website");
  assert.ok(article.tags.length > 0 && article.tags.length <= 4, "Tags should be between 1 and 4");
  assert.ok(article.fullMdxContent.includes("canonicalUrl:"), "MDX must contain canonicalUrl in frontmatter");
  console.log(`   ✅ Article generated: "${article.title}"\n`);

  // Test 3: GitHub PR simulation in dry-run
  console.log("3. Testing GitHub Next.js PR simulation...");
  const prResult = await createNextJsBlogPR(config, article);
  assert.ok(prResult.pullRequestUrl.includes("/pull/"), "PR URL should be generated");
  assert.ok(prResult.filePath.endsWith(config.TARGET_FILE_EXT), "File path should match target extension");
  console.log(`   ✅ PR simulation passed: ${prResult.pullRequestUrl}\n`);

  // Test 4: DEV.to publishing simulation in dry-run (API)
  console.log("4. Testing DEV.to API simulation with canonical URL...");
  const devToResult = await publishToDevTo(config, article);
  assert.strictEqual(devToResult.canonicalUrl, article.canonicalUrl, "DEV.to canonical URL must match article canonical URL");
  console.log(`   ✅ DEV.to API simulation passed: ${devToResult.articleUrl}\n`);

  // Test 5: DEV.to Playwright publishing simulation in dry-run
  console.log("5. Testing DEV.to Playwright browser simulation...");
  const pwResult = await publishToDevToWithPlaywright(config, article);
  assert.strictEqual(pwResult.canonicalUrl, article.canonicalUrl, "Playwright canonical URL must match article canonical URL");
  console.log(`   ✅ DEV.to Playwright simulation passed: ${pwResult.articleUrl}\n`);

  console.log("🎉 All tests passed successfully!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
