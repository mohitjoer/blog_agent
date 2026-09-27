import { fileURLToPath } from "url";

export interface SitemapBlogEntry {
  loc: string;
  slug: string;
  lastmod?: string;
  title: string;
  canonicalUrl: string;
}

export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function fetchBlogPostsFromSitemap(
  sitemapUrl: string,
  targetSiteUrl: string
): Promise<SitemapBlogEntry[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "BlogAgent/1.0",
      },
    });

    if (!res.ok) {
      console.warn(`⚠️ Failed to fetch sitemap from ${sitemapUrl}: ${res.status} ${res.statusText}`);
      return [];
    }

    const xml = await res.text();
    const blogEntries: SitemapBlogEntry[] = [];

    // Match all <url> blocks
    const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match: RegExpExecArray | null;

    while ((match = urlBlockRegex.exec(xml)) !== null) {
      const block = match[1];
      const locMatch = /<loc>(.*?)<\/loc>/i.exec(block);
      const lastmodMatch = /<lastmod>(.*?)<\/lastmod>/i.exec(block);

      if (!locMatch) continue;

      const loc = locMatch[1].trim();

      // Only match blog article URLs: /blog/<slug> (ignore index /blog or /docs)
      const blogPathMatch = /\/blog\/([a-zA-Z0-9_-]+)$/i.exec(loc);
      if (!blogPathMatch) continue;

      const slug = blogPathMatch[1];
      const lastmod = lastmodMatch ? lastmodMatch[1].trim() : new Date().toISOString();
      const canonicalUrl = `${targetSiteUrl.replace(/\/$/, "")}/blog/${slug}`;

      blogEntries.push({
        loc,
        slug,
        lastmod,
        title: slugToTitle(slug),
        canonicalUrl,
      });
    }

    return blogEntries;
  } catch (err) {
    console.error(`⚠️ Error fetching or parsing sitemap from ${sitemapUrl}:`, err);
    return [];
  }
}

// If run directly via CLI (e.g. tsx src/sitemap.ts)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetSiteUrl = process.env.TARGET_SITE_URL || "https://felona-voice.mohitjoe.tech";
  const sitemapUrl = `${targetSiteUrl.replace(/\/$/, "")}/sitemap.xml`;
  console.log(`📡 Inspecting live sitemap: ${sitemapUrl}`);
  fetchBlogPostsFromSitemap(sitemapUrl, targetSiteUrl)
    .then((entries) => {
      console.log(`✅ Found ${entries.length} published blog posts:`);
      entries.forEach((e, idx) => {
        console.log(`  ${idx + 1}. [${e.slug}] ${e.title} -> ${e.canonicalUrl}`);
      });
    })
    .catch(console.error);
}

