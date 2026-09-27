import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Config } from "./config.js";

export interface GeneratedArticle {
  title: string;
  slug: string;
  description: string;
  tags: string[];
  markdownContent: string;
  fullMdxContent: string;
  canonicalUrl: string;
  publishedAt: string;
}

export interface HistorySummary {
  title: string;
  slug: string;
}

export async function generateBlogPost(
  config: Config,
  topicIdea?: string,
  existingArticles: (string | HistorySummary)[] = []
): Promise<GeneratedArticle> {
  const dateStr = new Date().toISOString().split("T")[0];

  const formattedArticles = existingArticles
    .map((item) => (typeof item === "string" ? `- slug: "${item}"` : `- "${item.title}" (slug: ${item.slug})`))
    .join("\n");

  const existingSlugs = existingArticles.map((item) => (typeof item === "string" ? item : item.slug));

  // Dry run fallback when no actual Gemini key is configured
  if (config.DRY_RUN && (!config.GEMINI_API_KEY || config.GEMINI_API_KEY === "mock-gemini-key")) {
    const slug = "building-reliable-agentic-workflows-typescript";
    const canonicalUrl = `${config.TARGET_SITE_URL.replace(/\/$/, "")}${config.BLOG_PATH_PREFIX}/${slug}`;
    const title = "Building Reliable Agentic Workflows in TypeScript";
    const description = "Learn how to architect, test, and automate production-grade AI agent workflows using TypeScript and GitHub Actions.";
    const tags = ["typescript", "ai", "github", "webdev"];
    const body = `# ${title}

Agentic workflows are transforming how modern software teams automate repetitive engineering tasks. In this guide, we explore building end-to-end autonomous content pipelines using TypeScript and GitHub Actions.

## Key Architectural Patterns

1. **Deterministic State Management**: Ensure agent executions are reproducible and traceable.
2. **Schema Validation**: Leverage libraries like Zod to validate AI outputs before publishing.
3. **Cross-Platform Syndication**: Automate publishing with canonical URLs to preserve domain authority.

\`\`\`typescript
import { z } from "zod";

const AgentResultSchema = z.object({
  status: z.enum(["success", "retry", "failure"]),
  publishedUrl: z.string().url(),
});
\`\`\`

## Preserving SEO with Canonical URLs

Cross-posting to platforms like DEV.to expands your audience while canonical URLs guarantee that your personal website retains full search engine indexing priority.

## Summary

Automating your publishing workflow allows you to maintain high cadence without sacrificing code quality or SEO authority.
`;

    const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: "${dateStr}"
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
canonicalUrl: "${canonicalUrl}"
author: "Mohit / Felona Voice Core Team"
---

`;

    return {
      title,
      slug,
      description,
      tags,
      markdownContent: body,
      fullMdxContent: `${frontmatter}${body}`,
      canonicalUrl,
      publishedAt: dateStr,
    };
  }

  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          slug: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          tags: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          content: { type: SchemaType.STRING },
        },
        required: ["title", "slug", "description", "tags", "content"],
      },
    },
  });

  const prompt = `You are an elite AI engineer, open-source evangelist, and technical writer. 
Generate a comprehensive, high-quality, practical technical blog post promoting the open-source project **Felona Voice** (https://github.com/mohitjoer/felona_voice).

PROJECT CONTEXT:
- **Felona Voice** is an open-source, ultra-low-latency voice agent framework for TypeScript.
- NPM Package: \`npm install felona-voice\`
- GitHub Repo: https://github.com/mohitjoer/felona_voice
- Live Website & Docs: https://felona-voice.mohitjoe.tech
- Core Innovation: Powered by **Joint Embedding Vectors (JEV)** with stateful conversational transition graphs (VoiceGraph).
  - Traditional LLM prompts take 500ms-1200ms+ per conversational turn and suffer from hallucinations.
  - Hardcoded static graphs are too rigid for natural off-script human speech.
  - Felona Voice uses JEV similarity matching to decide the next action in **sub-10ms (~5ms)** with zero token latency and zero hallucinations!
- Developer Experience:
  - Fluent builder API:
    \`\`\`typescript
    import { createAgent } from "felona-voice";

    const agent = createAgent("Concierge")
      .system("You are an intelligent voice concierge.")
      .action("book_table", "Book restaurant reservation", async (ctx) => "Table booked!")
      .fallback("How can I assist you?");

    const reply = await agent.interact("Can I book a table?");
    \`\`\`
  - Pluggable audio pipelines for WebSockets, WebRTC, Deepgram, Whisper, ElevenLabs, and Cartesia.
  - Zero external API keys needed for local testing and deterministic routing.
${config.PROMPT_CONTEXT ? `\nADDITIONAL PROJECT CONTEXT:\n${config.PROMPT_CONTEXT}\n` : ""}
${
  topicIdea
    ? `Target Topic/Prompt Provided: "${topicIdea}"`
    : `AUTONOMOUS TOPIC BRAINSTORMING & REASONING:
You are NOT running from a queue or hardcoded list. You are an autonomous AI evangelist who thinks critically about technical voice AI architecture.
1. Review the existing published articles below to understand what has already been explored.
2. Identify a high-value technical angle or content gap in the voice AI space:
   - Financial & Cost Reduction: Deep dive into monthly cloud bills for 50k-500k calls, showing how replacing auto-regressive LLM tokens with JEV in-memory vector matching cuts costs by 95% ($0.00 vs $0.04/turn).
   - Real-Time Conversational Latency: How 800ms-1800ms LLM latency breaks conversational turn-taking, and how Felona Voice achieves ~5ms sub-10ms intent resolution for instant barge-in handling.
   - Zero Hallucination Voice Graphs: Why deterministic state machines are essential for enterprise compliance (banking, healthcare, customer support) compared to probabilistic LLM text generation.
   - Duplex Audio Pipelines: Architecting WebSocket duplex audio streaming with Deepgram/Cartesia and TypeScript.
   - Architectural Comparison: Why streaming LLM tokens (TTFT + token generation) is fundamentally the wrong paradigm for structured voice agents compared to Joint Embedding Vectors (JEV).
3. Brainstorm an original, fresh technical topic that has NOT been covered yet by any existing article.`
}

PREVIOUSLY PUBLISHED ARTICLES (DO NOT DUPLICATE THESE):
${formattedArticles || "None"}

Requirements:
1. "title": Engaging, catchy title highlighting voice AI, latency, or TypeScript (60-80 chars max).
2. "slug": Clean URL-friendly kebab-case string (e.g. "sub-10ms-voice-agents-typescript-felona").
3. "description": Punchy 1-2 sentence meta description / summary for SEO (140-160 chars).
4. "tags": Array of 3-4 lowercase alphanumeric tags matching dev.to conventions (e.g. ["typescript", "ai", "webdev", "voiceai"]).
5. "content": In-depth Markdown article (800-1200 words):
   - Enthusiastic, highly educational, developer-first tone promoting \`felona-voice\`.
   - Real, copy-pasteable TypeScript code snippets using \`import { createAgent } from "felona-voice"\`.
   - **Cost & Latency Breakdown (Mandatory)**: Include side-by-side Markdown comparison tables contrasting:
     | Metric | Traditional Voice Agent (LLM Loop) | Felona Voice (JEV + VoiceGraph) |
     | Intent Decision Latency | 850ms – 1,800ms | **~5ms** (Sub-10ms) |
     | Inference Cost / Turn | $0.02 – $0.06+ / turn | **$0.00** / turn |
     | Hallucination Risk | High (probabilistic text tokens) | **0%** (deterministic transition graph) |
     | Network Dependency | Requires constant cloud LLM API | Local/In-memory embedding matching |
   - Explain mathematically how using JEV in place of raw LLM reasoning loops cuts infrastructure bills by 90-95% when scaling to thousands of calls.
   - Include a clear Call to Action (CTA) at the end:
     - 🌟 Star the repository on GitHub: [github.com/mohitjoer/felona_voice](https://github.com/mohitjoer/felona_voice)
     - 📦 Install via npm: \`npm install felona-voice\`
     - 📖 Explore full documentation: [felona-voice.mohitjoe.tech/docs](https://felona-voice.mohitjoe.tech/docs)
   - Do NOT include frontmatter or H1 title in the content body (title will be rendered separately).

Return your response strictly as a JSON object matching this schema:
{
  "title": string,
  "slug": string,
  "description": string,
  "tags": string[],
  "content": string
}`;
  let result;
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      result = await model.generateContent(prompt);
      break;
    } catch (err: any) {
      if (
        attempt < maxRetries &&
        (err?.status === 503 ||
          err?.status === 429 ||
          err?.message?.includes("503") ||
          err?.message?.includes("429") ||
          err?.message?.includes("high demand") ||
          err?.message?.includes("overloaded"))
      ) {
        const delaySec = attempt * 3;
        console.warn(`⚠️ Gemini API temporary spike (${err?.status || "503"}), retrying in ${delaySec}s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delaySec * 1000));
      } else {
        throw err;
      }
    }
  }

  if (!result) {
    throw new Error("Failed to receive response from Gemini model.");
  }

  let rawText = result.response.text().trim();
  if (rawText.startsWith("```json")) {
    rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(rawText) as {
    title: string;
    slug: string;
    description: string;
    tags: string[];
    content: string;
  };

  const cleanSlug = parsed.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const cleanTags = parsed.tags.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, "")).slice(0, 4);

  const canonicalUrl = `${config.TARGET_SITE_URL.replace(/\/$/, "")}${config.BLOG_PATH_PREFIX}/${cleanSlug}`;

  const frontmatter = `---
title: "${parsed.title.replace(/"/g, '\\"')}"
description: "${parsed.description.replace(/"/g, '\\"')}"
date: "${dateStr}"
tags: [${cleanTags.map((t) => `"${t}"`).join(", ")}]
canonicalUrl: "${canonicalUrl}"
author: "${config.BLOG_AUTHOR.replace(/"/g, '\\"')}"
---

`;

  return {
    title: parsed.title,
    slug: cleanSlug,
    description: parsed.description,
    tags: cleanTags,
    markdownContent: parsed.content,
    fullMdxContent: `${frontmatter}${parsed.content}`,
    canonicalUrl,
    publishedAt: dateStr,
  };
}
