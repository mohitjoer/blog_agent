import { Config } from "./config.js";
import { GeneratedArticle } from "./generator.js";

export interface DevToPublishResult {
  articleId: number;
  articleUrl: string;
  canonicalUrl: string;
  published: boolean;
}

export async function publishToDevTo(
  config: Config,
  article: GeneratedArticle
): Promise<DevToPublishResult> {
  const published = !config.DEVTO_PUBLISH_AS_DRAFT;

  if (config.DRY_RUN) {
    console.log(`[DRY-RUN] DEV.to publishing simulation:`);
    console.log(`  - Title: ${article.title}`);
    console.log(`  - Canonical URL: ${article.canonicalUrl}`);
    console.log(`  - Published: ${published}`);
    console.log(`  - Tags: ${article.tags.join(", ")}`);
    return {
      articleId: 1234567,
      articleUrl: `https://dev.to/username/${article.slug}-simulation`,
      canonicalUrl: article.canonicalUrl,
      published,
    };
  }

  // dev.to accepts up to 4 tags, lowercase alphanumeric only
  const sanitizedTags = article.tags
    .map((tag) => tag.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((tag) => tag.length > 0)
    .slice(0, 4);

  // Markdown body with canonical notice footer
  const bodyWithAttribution = `${article.markdownContent}

---

*This article was originally published on [${config.TARGET_SITE_URL.replace(/^https?:\/\//, "")}](${article.canonicalUrl}).*
`;

  const payload = {
    article: {
      title: article.title,
      published,
      body_markdown: bodyWithAttribution,
      tags: sanitizedTags,
      canonical_url: article.canonicalUrl,
      description: article.description,
    },
  };

  console.log(`Posting article to DEV.to (Canonical: ${article.canonicalUrl})...`);

  const response = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.DEVTO_API_KEY,
      Accept: "application/vnd.forem.api-v1+json",
      "User-Agent": "Blog-Agent-Workflow/1.0",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post to DEV.to (HTTP ${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    id: number;
    url: string;
    canonical_url: string;
    published: boolean;
  };

  console.log(`✅ DEV.to article published successfully: ${data.url}`);

  return {
    articleId: data.id,
    articleUrl: data.url,
    canonicalUrl: data.canonical_url || article.canonicalUrl,
    published: data.published,
  };
}
