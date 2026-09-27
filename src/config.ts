import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Google Gemini API Key
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // Target Next.js Repository settings
  TARGET_REPO_PAT: z.string().min(1, "TARGET_REPO_PAT (GitHub Personal Access Token) is required"),
  TARGET_REPO_OWNER: z.string().min(1, "TARGET_REPO_OWNER is required (e.g. 'your-github-username')"),
  TARGET_REPO_NAME: z.string().min(1, "TARGET_REPO_NAME is required (e.g. 'your-website-repo')"),
  TARGET_BLOG_DIR: z.string().default("content/posts"),
  TARGET_FILE_EXT: z.enum(["mdx", "md"]).default("mdx"),
  TARGET_BASE_BRANCH: z.string().default("main"),
  TARGET_BLOG_BRANCH: z.string().default("blog_branch"),

  // Website Canonical URL settings
  TARGET_SITE_URL: z.string().url("TARGET_SITE_URL must be a valid URL (e.g. 'https://your-domain.com')"),
  BLOG_PATH_PREFIX: z.string().default("/blog"),

  // DEV.to Publishing Settings
  PUBLISH_METHOD: z.enum(["playwright", "api"]).default("playwright"),
  DEVTO_API_KEY: z.string().optional().default(""),
  DEVTO_EMAIL: z.string().optional().default(""),
  DEVTO_PASSWORD: z.string().optional().default(""),
  DEVTO_SESSION_PATH: z.string().default(".auth/devto-session.json"),
  PLAYWRIGHT_HEADLESS: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(true),
  DEVTO_PUBLISH_AS_DRAFT: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),

  // Content generation settings
  BLOG_AUTHOR: z.string().default("Blog Agent"),
  PROMPT_CONTEXT: z.string().optional().default(""),

  // Operational settings
  PR_ONLY: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  DRY_RUN: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(overrides?: Partial<Config>): Config {
  const isDryRunArg = process.argv.includes("--dry-run");
  const isPrOnlyArg = process.argv.includes("--pr-only");

  const rawEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
    GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    TARGET_REPO_PAT: process.env.TARGET_REPO_PAT ?? "",
    TARGET_REPO_OWNER: process.env.TARGET_REPO_OWNER ?? "",
    TARGET_REPO_NAME: process.env.TARGET_REPO_NAME ?? "",
    TARGET_BLOG_DIR: process.env.TARGET_BLOG_DIR || "content/posts",
    TARGET_FILE_EXT: (process.env.TARGET_FILE_EXT as "mdx" | "md") || "mdx",
    TARGET_BASE_BRANCH: process.env.TARGET_BASE_BRANCH || "main",
    TARGET_BLOG_BRANCH: process.env.TARGET_BLOG_BRANCH || "blog_branch",
    TARGET_SITE_URL: process.env.TARGET_SITE_URL ?? "",
    BLOG_PATH_PREFIX: process.env.BLOG_PATH_PREFIX || "/blog",
    PUBLISH_METHOD: (process.env.PUBLISH_METHOD as "playwright" | "api") || "playwright",
    DEVTO_API_KEY: process.env.DEVTO_API_KEY ?? "",
    DEVTO_EMAIL: process.env.DEVTO_EMAIL ?? "",
    DEVTO_PASSWORD: process.env.DEVTO_PASSWORD ?? "",
    DEVTO_SESSION_PATH: process.env.DEVTO_SESSION_PATH || ".auth/devto-session.json",
    PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS ?? "true",
    DEVTO_PUBLISH_AS_DRAFT: process.env.DEVTO_PUBLISH_AS_DRAFT ?? "false",
    BLOG_AUTHOR: process.env.BLOG_AUTHOR || "Blog Agent",
    PROMPT_CONTEXT: process.env.PROMPT_CONTEXT ?? "",
    PR_ONLY: isPrOnlyArg || process.env.PR_ONLY === "true",
    DRY_RUN: isDryRunArg || process.env.DRY_RUN === "true",
    ...overrides,
  };

  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    if (rawEnv.DRY_RUN) {
      console.warn("⚠️ Running in DRY_RUN mode with fallback mock configuration where secrets are missing.");
      return {
        GEMINI_API_KEY: rawEnv.GEMINI_API_KEY || "mock-gemini-key",
        GEMINI_MODEL: rawEnv.GEMINI_MODEL,
        TARGET_REPO_PAT: rawEnv.TARGET_REPO_PAT || "mock-gh-pat",
        TARGET_REPO_OWNER: rawEnv.TARGET_REPO_OWNER || "example-user",
        TARGET_REPO_NAME: rawEnv.TARGET_REPO_NAME || "example-website",
        TARGET_BLOG_DIR: rawEnv.TARGET_BLOG_DIR,
        TARGET_FILE_EXT: rawEnv.TARGET_FILE_EXT,
        TARGET_BASE_BRANCH: rawEnv.TARGET_BASE_BRANCH,
        TARGET_BLOG_BRANCH: rawEnv.TARGET_BLOG_BRANCH,
        TARGET_SITE_URL: rawEnv.TARGET_SITE_URL || "https://example.com",
        BLOG_PATH_PREFIX: rawEnv.BLOG_PATH_PREFIX,
        PUBLISH_METHOD: rawEnv.PUBLISH_METHOD,
        DEVTO_API_KEY: rawEnv.DEVTO_API_KEY,
        DEVTO_EMAIL: rawEnv.DEVTO_EMAIL,
        DEVTO_PASSWORD: rawEnv.DEVTO_PASSWORD,
        DEVTO_SESSION_PATH: rawEnv.DEVTO_SESSION_PATH,
        PLAYWRIGHT_HEADLESS: rawEnv.PLAYWRIGHT_HEADLESS === "true" || rawEnv.PLAYWRIGHT_HEADLESS === true,
        DEVTO_PUBLISH_AS_DRAFT: rawEnv.DEVTO_PUBLISH_AS_DRAFT === "true" || rawEnv.DEVTO_PUBLISH_AS_DRAFT === true,
        BLOG_AUTHOR: rawEnv.BLOG_AUTHOR,
        PROMPT_CONTEXT: rawEnv.PROMPT_CONTEXT,
        PR_ONLY: Boolean(rawEnv.PR_ONLY),
        DRY_RUN: true,
      };
    }

    const errors = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`❌ Configuration validation failed:\n${errors}\n\nPlease check your .env or GitHub Action Secrets.`);
  }

  return parsed.data;
}
