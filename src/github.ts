import { Octokit } from "@octokit/rest";
import { Config } from "./config.js";
import { GeneratedArticle } from "./generator.js";

export interface GitHubPRResult {
  pullRequestUrl: string;
  pullRequestNumber: number;
  branchName: string;
  filePath: string;
}

export async function createNextJsBlogPR(
  config: Config,
  article: GeneratedArticle
): Promise<GitHubPRResult> {
  const filePath = `${config.TARGET_BLOG_DIR.replace(/\/$/, "")}/${article.slug}.${config.TARGET_FILE_EXT}`;
  const branchName = config.TARGET_BLOG_BRANCH || "blog_branch";

  if (config.DRY_RUN) {
    console.log(`[DRY-RUN] GitHub PR simulation:`);
    console.log(`  - Target: ${config.TARGET_REPO_OWNER}/${config.TARGET_REPO_NAME}`);
    console.log(`  - File: ${filePath}`);
    console.log(`  - Branch: ${branchName} -> ${config.TARGET_BASE_BRANCH}`);
    return {
      pullRequestUrl: `https://github.com/${config.TARGET_REPO_OWNER}/${config.TARGET_REPO_NAME}/pull/999`,
      pullRequestNumber: 999,
      branchName,
      filePath,
    };
  }

  const octokit = new Octokit({
    auth: config.TARGET_REPO_PAT,
  });

  const owner = config.TARGET_REPO_OWNER;
  const repo = config.TARGET_REPO_NAME;
  const baseBranch = config.TARGET_BASE_BRANCH;

  // 1. Ensure target branch 'blog_branch' exists
  let branchExists = false;
  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
    branchExists = true;
    console.log(`Branch '${branchName}' already exists.`);
  } catch (err: any) {
    if (err.status !== 404) throw err;
  }

  if (!branchExists) {
    console.log(`Fetching latest commit SHA from ${owner}/${repo} branch '${baseBranch}'...`);
    const branchRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const latestSha = branchRef.data.object.sha;

    console.log(`Creating branch '${branchName}' at ${latestSha}...`);
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: latestSha,
    });
  }

  // 2. Check if file already exists in 'blog_branch' to include SHA for updates
  let existingFileSha: string | undefined;
  try {
    const fileRes = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branchName,
    });
    if (!Array.isArray(fileRes.data) && "sha" in fileRes.data) {
      existingFileSha = fileRes.data.sha;
    }
  } catch (err: any) {
    if (err.status !== 404) throw err;
  }

  // 3. Commit file to 'blog_branch'
  console.log(`Committing file '${filePath}' to '${branchName}'...`);
  const fileContentBase64 = Buffer.from(article.fullMdxContent, "utf-8").toString("base64");
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `feat(blog): add post "${article.title}"`,
    content: fileContentBase64,
    branch: branchName,
    ...(existingFileSha ? { sha: existingFileSha } : {}),
  });

  // 4. Check if an open PR already exists for 'blog_branch' -> 'main'
  console.log(`Checking for existing open Pull Request for '${branchName}'...`);
  const existingPRs = await octokit.rest.pulls.list({
    owner,
    repo,
    head: `${owner}:${branchName}`,
    base: baseBranch,
    state: "open",
  });

  let prUrl: string;
  let prNumber: number;

  const articleEntry = `### 📄 ${article.title}
- **File:** \`${filePath}\`
- **Canonical URL:** [${article.canonicalUrl}](${article.canonicalUrl})
- **Summary:** ${article.description}
- **Tags:** ${article.tags.map((t) => `#${t}`).join(" ")}
`;

  if (existingPRs.data.length > 0) {
    const existingPr = existingPRs.data[0];
    prUrl = existingPr.html_url;
    prNumber = existingPr.number;
    console.log(`ℹ️ An open PR (#${prNumber}) already exists for '${branchName}' -> '${baseBranch}': ${prUrl}`);

    const updatedBody = `${existingPr.body || "## 🤖 Automated Blog Posts"}\n\n---\n\n${articleEntry}`;
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: updatedBody,
    });
    console.log(`✅ Updated PR #${prNumber} with the new blog post!`);
  } else {
    console.log(`Opening Pull Request from '${branchName}' to '${baseBranch}'...`);
    const prBody = `## 🤖 Automated Blog Publication

All blog posts are aggregated into this single \`${branchName}\` branch.

---

${articleEntry}

---
*Created automatically by the Blog Publishing Agent workflow.*
`;

    const pr = await octokit.rest.pulls.create({
      owner,
      repo,
      title: `feat(blog): publish blog posts (${branchName})`,
      head: branchName,
      base: baseBranch,
      body: prBody,
    });
    prUrl = pr.data.html_url;
    prNumber = pr.data.number;
    console.log(`✅ Pull Request created: ${prUrl}`);
  }

  return {
    pullRequestUrl: prUrl,
    pullRequestNumber: prNumber,
    branchName,
    filePath,
  };
}
