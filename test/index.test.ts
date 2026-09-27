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
  const config = loadConfig({ DRY_RUN: true });
  assert.strictEqual(config.DRY_RUN, true, "Config should enable DRY_RUN");
  assert.ok(config.TARGET_SITE_URL, "TARGET_SITE_URL should have a value");
  console.log("   ✅ Config loaded successfully.\n");

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
