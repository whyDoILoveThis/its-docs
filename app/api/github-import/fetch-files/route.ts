import { NextResponse } from "next/server";

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

    // Fetch files in parallel (max 8 at a time to avoid hammering GitHub)
    const BATCH_SIZE = 8;
    const results: { path: string; content: string; error?: string }[] = [];

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (filePath: string) => {
          try {
            const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
            const res = await fetch(url, { headers });

            if (!res.ok) {
              return { path: filePath, content: "", error: `HTTP ${res.status}` };
            }

            const data = await res.json();

            if (data.encoding === "base64" && data.content) {
              const decoded = Buffer.from(data.content, "base64").toString("utf-8");
              // Truncate very long files to avoid token explosion
              const MAX_CHARS = 8000;
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
    }

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error("Error in github-import/fetch-files:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
