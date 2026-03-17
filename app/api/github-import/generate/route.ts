import { NextResponse } from "next/server";
import { extractJSON } from "@/lib/extractJSON";
import { buildIndex } from "@/lib/repo-intel/symbolIndexer";
import { buildDependencyGraph } from "@/lib/repo-intel/dependencyGraph";
import {
  buildContext,
  assembleContextText,
  buildContextSummary,
} from "@/lib/repo-intel/contextBuilder";
import { buildEmbeddingIndex } from "@/lib/repo-intel/embeddingEngine";
import type { RepoFile } from "@/lib/repo-intel/repoScanner";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are an elite documentation generator powered by deep code intelligence. Given precisely selected source code (including exact function bodies, type definitions, imports, and dependency chains), you create structured documentation that explains the code clearly and accurately.

You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON.

Response format:
{
  "title": "Doc Title",
  "tagline": "Short tagline",
  "desc": "Brief description",
  "docItems": [
    { "style": "text-xl font-bold ", "text": "Section Header" },
    { "style": "btn-blue", "text": "Explanation of what this code does" },
    { "style": "code", "text": "relevant code snippet" },
    { "style": "btn-green", "text": "Key takeaways or best practices" },
    { "style": "btn-yellow", "text": "Important notes" },
    { "style": "btn-red", "text": "Warnings or gotchas" },
    { "style": "btn-orange", "text": "Additional context" }
  ]
}

STYLE GUIDE:
- "text-xl font-bold " = Section headers — use to separate logical sections
- "btn-blue" = General explanations, what code does, how it works
- "btn-green" = Best practices, key features, what works well
- "btn-yellow" = Tips, things to note, dependencies
- "btn-orange" = Alternative approaches, context, related info
- "btn-red" = Warnings, common pitfalls, security concerns
- "code" = Code snippets — include the most important/illustrative parts

RULES:
- ONLY use information that appears in the provided source code. Never invent function names, variable names, imports, behaviors, or any detail not present in the code.
- The code has been precisely selected using symbol indexing and dependency analysis. Trust this context.
- When including code snippets, copy them VERBATIM from the provided code. Never paraphrase or pseudo-code.
- Write like a knowledgeable developer explaining code to a teammate
- Use a natural mix of styles for visual interest and meaning
- Include relevant code snippets: key functions, patterns, types
- Section headers should describe what that section covers
- Be thorough but concise
- Generate 8-25 items depending on complexity
- If multiple files are provided, document them cohesively
- Focus on: what it does, how it works, key patterns, important details
- ONLY return valid JSON, nothing else`,
};

export async function POST(req: Request) {
  try {
    const { files, prompt, docTitle } = await req.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "files array is required" },
        { status: 400 }
      );
    }

    // Build file contents string using intelligence engine
    const repoFiles: RepoFile[] = files
      .filter((f: { content: string }) => f.content)
      .map((f: { path: string; content: string }) => {
        const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
        const langMap: Record<string, string> = {
          ".ts": "typescript", ".tsx": "typescript",
          ".js": "javascript", ".jsx": "javascript",
          ".py": "python", ".go": "go", ".rs": "rust",
          ".java": "java", ".css": "css", ".html": "html",
          ".json": "json", ".yaml": "yaml", ".yml": "yaml",
          ".md": "markdown",
        };
        return {
          path: f.path,
          content: f.content,
          size: f.content.length,
          language: langMap[ext] || "text",
        };
      });

    if (repoFiles.length === 0) {
      return NextResponse.json(
        { error: "No file contents to document" },
        { status: 400 }
      );
    }

    // Index and build intelligent context with semantic search
    const repoIndex = buildIndex(repoFiles);
    const depGraph = buildDependencyGraph(repoIndex);
    const embeddingIndex = buildEmbeddingIndex(repoIndex);
    const context = buildContext(
      prompt || docTitle || "document this code",
      repoIndex,
      depGraph,
      { maxTokens: 18000, includeArchitecture: true, embeddingIndex },
    );
    const contextText = assembleContextText(context);
    const contextSummary = buildContextSummary(context);

    let userContent = `Create documentation for the following code files.`;
    if (docTitle) {
      userContent += `\nDoc title should be: "${docTitle}"`;
    }
    if (prompt) {
      userContent += `\nUser instructions: ${prompt}`;
    }
    userContent += `\n\n## Analyzed Source Code (${context.includedFiles.length} files)\n`;
    userContent += `Intelligence summary: ${contextSummary}\n\n`;
    userContent += contextText;

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
          temperature: 0.5,
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
      // Check for rate limit
      if (status === 429) {
        const retryAfter = data?.error?.message?.match(/try again in (\d+\.?\d*s)/)?.[1];
        return NextResponse.json(
          {
            error: "Rate limited by AI provider",
            retryAfter: retryAfter || "60s",
            rateLimited: true,
          },
          { status: 429 }
        );
      }
      const errText = data?.error?.message || "";
      if (errText.includes("Request too large") || errText.includes("tokens per minute")) {
        const requestedMatch = errText.match(/Requested (\d+)/);
        const limitMatch = errText.match(/Limit (\d+)/);
        return NextResponse.json(
          {
            error: "Request too large for AI model",
            tooLarge: true,
            requestedTokens: requestedMatch ? parseInt(requestedMatch[1]) : null,
            limit: limitMatch ? parseInt(limitMatch[1]) : 30000,
          },
          { status: 413 }
        );
      }
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

    const { parsed, error: jsonError } = extractJSON(rawReply);
    if (jsonError || parsed === null) {
      return NextResponse.json(
        { error: "AI returned invalid JSON", detail: jsonError, raw: rawReply },
        { status: 502 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("Error in github-import/generate:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
