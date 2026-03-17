/**
 * repoScanner.ts — Fetches a GitHub repo's file tree and contents.
 * Returns structured file data for the symbol indexer.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Types ----------

export interface RepoFile {
  path: string;
  content: string;
  size: number;
  language: string;
}

export interface ScanResult {
  owner: string;
  repo: string;
  branch: string;
  files: RepoFile[];
  tree: { path: string; size: number }[];
  scannedAt: number;
}

// ---------- Constants ----------

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".lock", ".map",
]);

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".vercel",
  "__pycache__", ".cache", "coverage", ".turbo", ".output",
  "vendor", ".nuxt", ".svelte-kit",
]);

const IGNORE_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".DS_Store", "Thumbs.db",
]);

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript",
  ".py": "python", ".rb": "ruby", ".go": "go",
  ".rs": "rust", ".java": "java", ".kt": "kotlin",
  ".cs": "csharp", ".cpp": "cpp", ".c": "c", ".h": "c",
  ".swift": "swift", ".php": "php",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".html": "html", ".vue": "vue", ".svelte": "svelte",
  ".json": "json", ".yaml": "yaml", ".yml": "yaml",
  ".md": "markdown", ".mdx": "markdown",
  ".sql": "sql", ".sh": "shell", ".bash": "shell",
  ".toml": "toml", ".xml": "xml", ".graphql": "graphql",
};

const MAX_FILE_SIZE = 150_000; // 150KB — skip very large files
const MAX_CONTENT_CHARS = 30_000; // truncate at 30k chars

// ---------- Public API ----------

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  ghToken?: string,
): Promise<{ tree: { path: string; size: number }[]; truncated: boolean }> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "its-the-docs",
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && (data.message || "").includes("rate limit")) {
      throw new Error("GITHUB_RATE_LIMIT");
    }
    throw new Error(data.message || `GitHub API ${res.status}`);
  }

  const data = await res.json();

  const tree = (data.tree || [])
    .filter((item: { type: string; path: string; size?: number }) => {
      if (item.type !== "blob") return false;
      const ext = item.path.substring(item.path.lastIndexOf(".")).toLowerCase();
      if (BINARY_EXTS.has(ext)) return false;
      const parts = item.path.split("/");
      if (parts.some((p: string) => IGNORE_DIRS.has(p))) return false;
      const fileName = parts[parts.length - 1];
      if (IGNORE_FILES.has(fileName)) return false;
      if (item.size && item.size > MAX_FILE_SIZE) return false;
      return true;
    })
    .map((item: { path: string; size?: number }) => ({
      path: item.path,
      size: item.size || 0,
    }));

  return { tree, truncated: data.truncated || false };
}

export async function fetchFileContents(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  ghToken?: string,
): Promise<RepoFile[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "its-the-docs",
  };
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`;

  const BATCH_SIZE = ghToken ? 8 : 3;
  const BATCH_DELAY = ghToken ? 150 : 1200;
  const results: RepoFile[] = [];

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
          const res = await fetch(url, { headers });

          if (res.status === 403) {
            const err = await res.json().catch(() => ({}));
            if ((err.message || "").includes("rate limit")) throw new Error("GITHUB_RATE_LIMIT");
            return null;
          }
          if (!res.ok) return null;

          const data = await res.json();
          if (data.encoding !== "base64" || !data.content) return null;

          let content = Buffer.from(data.content, "base64").toString("utf-8");
          if (content.length > MAX_CONTENT_CHARS) {
            content = content.substring(0, MAX_CONTENT_CHARS) + "\n// ... truncated ...";
          }

          const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
          return {
            path: filePath,
            content,
            size: content.length,
            language: LANG_MAP[ext] || "text",
          };
        } catch (err) {
          if (err instanceof Error && err.message === "GITHUB_RATE_LIMIT") throw err;
          return null;
        }
      }),
    );

    results.push(...batchResults.filter((r): r is RepoFile => r !== null));

    if (i + BATCH_SIZE < paths.length) {
      await delay(BATCH_DELAY);
    }
  }

  return results;
}

function getLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return LANG_MAP[ext] || "text";
}

export async function scanRepo(
  owner: string,
  repo: string,
  branch: string,
  ghToken?: string,
  filePaths?: string[],
): Promise<ScanResult> {
  const { tree, truncated } = await fetchRepoTree(owner, repo, branch, ghToken);

  // Fetch all source files (or specific ones if provided)
  const pathsToFetch = filePaths || tree.map((f) => f.path);
  const files = await fetchFileContents(owner, repo, branch, pathsToFetch, ghToken);

  return {
    owner,
    repo,
    branch,
    files,
    tree,
    scannedAt: Date.now(),
  };
}
