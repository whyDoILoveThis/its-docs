import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { owner, repo, branch, ghToken } = await req.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner and repo are required" },
        { status: 400 }
      );
    }

    const ref = branch || "main";
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "its-the-docs",
    };
    if (ghToken) {
      headers.Authorization = `Bearer ${ghToken}`;
    }

    const res = await fetch(url, { headers });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: data.message || "Failed to fetch repo tree",
          status: res.status,
        },
        { status: res.status === 404 ? 404 : 502 }
      );
    }

    // Filter to blobs (files) only, skip huge files and binary-looking paths
    const binaryExts = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp",
      ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov",
      ".woff", ".woff2", ".ttf", ".eot", ".otf",
      ".zip", ".tar", ".gz", ".rar", ".7z",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx",
      ".exe", ".dll", ".so", ".dylib", ".bin",
      ".lock", ".map",
    ]);

    const ignoreDirs = new Set([
      "node_modules", ".git", ".next", "dist", "build", ".vercel",
      "__pycache__", ".cache", "coverage", ".turbo",
    ]);

    const tree = (data.tree || [])
      .filter((item: { type: string; path: string; size?: number }) => {
        if (item.type !== "blob") return false;
        // Skip binary files
        const ext = item.path.substring(item.path.lastIndexOf(".")).toLowerCase();
        if (binaryExts.has(ext)) return false;
        // Skip ignored directories
        const parts = item.path.split("/");
        if (parts.some((p: string) => ignoreDirs.has(p))) return false;
        // Skip very large files (> 100KB)
        if (item.size && item.size > 100000) return false;
        return true;
      })
      .map((item: { path: string; size?: number }) => ({
        path: item.path,
        size: item.size || 0,
      }));

    return NextResponse.json({
      tree,
      totalFiles: tree.length,
      truncated: data.truncated || false,
    });
  } catch (err) {
    console.error("Error in github-import/tree:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
