import { NextResponse } from "next/server";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const { owner, repo, branch, files, ghToken } = await req.json();

    if (!owner || !repo || !files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "owner, repo, and files array are required" },
        { status: 400 }
      );
    }

    const ref = branch || "main";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "its-the-docs",
    };
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken}`;
    }

    // Smaller batches + delays to avoid GitHub rate limits
    // Unauthenticated: 60 req/hr, Authenticated: 5000 req/hr
    const BATCH_SIZE = ghToken ? 6 : 3;
    const BATCH_DELAY_MS = ghToken ? 200 : 1500;
    const results: { path: string; content: string; error?: string }[] = [];
    let hitRateLimit = false;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (hitRateLimit) break;

      const batch = files.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (filePath: string) => {
          try {
            const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
            const res = await fetch(url, { headers });

            // Detect GitHub rate limit
            if (res.status === 403) {
              const errData = await res.json().catch(() => ({}));
              if ((errData.message || "").includes("rate limit")) {
                hitRateLimit = true;
                return {
                  path: filePath,
                  content: "",
                  error: "GitHub rate limit exceeded",
                };
              }
              return { path: filePath, content: "", error: `HTTP 403: ${errData.message || "Forbidden"}` };
            }

            if (!res.ok) {
              return { path: filePath, content: "", error: `HTTP ${res.status}` };
            }

            const data = await res.json();

            if (data.encoding === "base64" && data.content) {
              const decoded = Buffer.from(data.content, "base64").toString("utf-8");
              // Allow large files — only truncate truly massive ones
              const MAX_CHARS = 25000;
              const content =
                decoded.length > MAX_CHARS
                  ? decoded.substring(0, MAX_CHARS) + "\n\n// ... file truncated (too long) ..."
                  : decoded;
              return { path: filePath, content };
            }

            return { path: filePath, content: "", error: "Unable to decode" };
          } catch (err) {
            return {
              path: filePath,
              content: "",
              error: err instanceof Error ? err.message : "Fetch failed",
            };
          }
        })
      );

      results.push(...batchResults);

      // Delay between batches to stay under rate limit
      if (i + BATCH_SIZE < files.length && !hitRateLimit) {
        await delay(BATCH_DELAY_MS);
      }
    }

    if (hitRateLimit) {
      return NextResponse.json({
        files: results,
        githubRateLimited: true,
        error: "GitHub API rate limit exceeded. Add a GitHub token for higher limits (5,000 req/hr vs 60/hr).",
      });
    }

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error("Error in github-import/fetch-files:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
