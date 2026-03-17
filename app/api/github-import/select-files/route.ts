import { NextResponse } from "next/server";
import { extractJSON } from "@/lib/extractJSON";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are a smart code analysis assistant. Given a repository file tree and a user prompt, you determine which files are relevant and group them into logical documentation chunks.

You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON.

Response format:
{
  "docPlans": [
    {
      "title": "Short doc title",
      "description": "One-line description of what this doc covers",
      "files": ["path/to/file1.ts", "path/to/file2.ts"]
    }
  ]
}

RULES:
- Each docPlan becomes one documentation page, so group files that belong together logically
- If the user asks about a specific topic, only select files relevant to that topic (be selective!)
- If the user asks to document the whole repo or a broad topic, create MULTIPLE docPlans grouped by feature/area
- Each docPlan should have at most 5-8 files to keep token usage reasonable
- If a group would have more than 8 files, split it into sub-groups
- Order is important: put the most important/foundational doc first
- Use clear, descriptive titles that a human would write
- File paths must exactly match paths from the tree provided
- Do NOT include config files, lock files, or boilerplate unless specifically asked
- For "document everything" requests, create logical groups like: Overview/Setup, API Routes, Components, Utilities, Data Models, etc.
- Be smart: if user says "document the auth system" only pick auth-related files
- ONLY return valid JSON, nothing else`,
};

export async function POST(req: Request) {
  try {
    const { tree, prompt } = await req.json();

    if (!tree || !Array.isArray(tree)) {
      return NextResponse.json(
        { error: "tree must be an array of file paths" },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    // Build a compact tree representation (just paths, no sizes for token saving)
    const pathList = tree.map((f: { path: string }) => f.path).join("\n");

    const userContent = `Repository file tree:\n${pathList}\n\nUser request: ${prompt}`;

    const messages = [SYSTEM_PROMPT, { role: "user", content: userContent }];

    const proxied = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages,
          temperature: 0.4,
        }),
      }
    );

    const status = proxied.status;
    const text = await proxied.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse provider response", providerStatus: status },
        { status: 502 }
      );
    }

    if (!proxied.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "AI provider error", providerStatus: status },
        { status: 502 }
      );
    }

    const rawReply =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text;

    if (!rawReply) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 }
      );
    }

    const { parsed: rawParsed, error: jsonError } = extractJSON(rawReply);
    if (jsonError || rawParsed === null) {
      return NextResponse.json(
        { error: "AI returned invalid JSON", detail: jsonError, raw: rawReply },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = rawParsed as any;

    // Validate structure
    if (!parsed.docPlans || !Array.isArray(parsed.docPlans)) {
      return NextResponse.json(
        { error: "AI response missing docPlans array", raw: rawReply },
        { status: 502 }
      );
    }

    // Validate all file paths exist in tree
    const validPaths = new Set(tree.map((f: { path: string }) => f.path));
    for (const plan of parsed.docPlans) {
      plan.files = (plan.files || []).filter((f: string) => validPaths.has(f));
    }
    // Remove empty plans
    parsed.docPlans = parsed.docPlans.filter(
      (p: { files: string[] }) => p.files.length > 0
    );

    return NextResponse.json({ docPlans: parsed.docPlans });
  } catch (err) {
    console.error("Error in github-import/select-files:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
