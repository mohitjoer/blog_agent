import fs from "fs/promises";
import { loadConfig } from "./config.js";
import { generateBlogPost } from "./generator.js";
import { createNextJsBlogPR } from "./github.js";
import { publishToDevTo } from "./devto.js";
import { publishToDevToWithPlaywright } from "./devto-playwright.js";
import { fetchBlogPostsFromSitemap } from "./sitemap.js";

function parseCliArgs(): { topicOverride?: string } {
  const args = process.argv.slice(2);
  const topicIdx = args.indexOf("--topic");
  if (topicIdx !== -1 && args[topicIdx + 1]) {
    return { topicOverride: args[topicIdx + 1] };
  }
  if (process.env.CUSTOM_TOPIC && process.env.CUSTOM_TOPIC.trim() !== "") {
    return { topicOverride: process.env.CUSTOM_TOPIC.trim() };
  }
  return {};
}

async function main() {
  console.log("==================================================");
  console.log("🚀 Starting Automated Blog Posting Workflow Agent");
  console.log("==================================================");

  const config = loadConfig();
  const { topicOverride } = parseCliArgs();

  // Dynamically inspect published articles from live website sitemap (Stateless — no repo data file)
  let existingArticles: { title: string; slug: string }[] = [];
  try {
    const sitemapUrl = `${config.TARGET_SITE_URL.replace(/\/$/, "")}/sitemap.xml`;
    console.log(`📡 Fetching live blog post history from sitemap: ${sitemapUrl}...`);
    const sitemapEntries = await fetchBlogPostsFromSitemap(sitemapUrl, config.TARGET_SITE_URL);
    existingArticles = sitemapEntries.map((e) => ({
      title: e.title,
      slug: e.slug,
    }));
    console.log(`✅ Discovered ${existingArticles.length} published articles from live website sitemap.`);
  } catch (err) {
    console.warn("⚠️ Could not fetch existing articles from sitemap:", err);
  }

  let topicPrompt: string | undefined = topicOverride;

  if (topicPrompt) {
    console.log(`🎯 Using user-provided topic prompt: "${topicPrompt}"`);
  } else {
    console.log("🧠 Autonomous Mode: Analyzing published history & reasoning the next strategic blog topic...");
    console.log(`   (Tracking ${existingArticles.length} published articles from site & sitemap to ensure zero duplication)`);
  }

  // Step 1: Generate article via Google Gemini
  console.log("\n[1/3] Reasoning and generating technical article with Google Gemini...");
  const article = await generateBlogPost(config, topicPrompt, existingArticles);

  console.log(`Generated: "${article.title}"`);
  console.log(`Slug: ${article.slug}`);
  console.log(`Canonical URL: ${article.canonicalUrl}`);
  console.log(`Tags: ${article.tags.join(", ")}`);

  // Step 2: Open Pull Request in target Next.js repository
  console.log("\n[2/3] Submitting article to target Next.js website repository...");
  const prResult = await createNextJsBlogPR(config, article);

  // Step 3: Publish to DEV.to with canonical URL
  let devToResult: { articleUrl: string; canonicalUrl: string; published: boolean } = {
    articleUrl: "Skipped (PR-only mode)",
    canonicalUrl: article.canonicalUrl,
    published: false,
  };

  if (config.PR_ONLY) {
    console.log(`\n[3/3] ⏩ Skipping DEV.to publishing (--pr-only mode active). Pull Request created!`);
  } else {
    console.log(`\n[3/3] Publishing to DEV.to with canonical URL attribution (Method: ${config.PUBLISH_METHOD.toUpperCase()})...`);
    if (config.PUBLISH_METHOD === "playwright") {
      devToResult = await publishToDevToWithPlaywright(config, article);
    } else {
      devToResult = await publishToDevTo(config, article);
    }
  }

  // Print Summary
  console.log("\n==================================================");
  console.log("🎉 Workflow Finished Successfully!");
  console.log("==================================================");
  console.log(`• Article Title: ${article.title}`);
  console.log(`• Website Canonical: ${article.canonicalUrl}`);
  console.log(`• Next.js Pull Request: ${prResult.pullRequestUrl}`);
  console.log(`• DEV.to Article: ${devToResult.articleUrl}`);
  console.log(`• DEV.to Published: ${devToResult.published ? "Yes (Live)" : "No (Draft)"}`);
  console.log("==================================================\n");

  // Output GitHub Actions step summary if running in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryMd = `
### 🚀 Blog Post Published Successfully!

| Property | Details |
|---|---|
| **Title** | ${article.title} |
| **Website Canonical URL** | [${article.canonicalUrl}](${article.canonicalUrl}) |
| **Next.js PR** | [PR #${prResult.pullRequestNumber}](${prResult.pullRequestUrl}) |
| **DEV.to Article** | [${devToResult.articleUrl}](${devToResult.articleUrl}) |
| **DEV.to Status** | ${devToResult.published ? "🟢 Live" : "🟡 Draft"} |
| **Tags** | \`${article.tags.join("`, `")}\` |

> Canonical URL set to \`${article.canonicalUrl}\` to ensure Google and search engines attribute domain authority directly to your website.
`;
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summaryMd, "utf-8");
  }
}

main().catch((err) => {
  console.error("\n❌ Workflow failed with error:", err);
  process.exit(1);
});
