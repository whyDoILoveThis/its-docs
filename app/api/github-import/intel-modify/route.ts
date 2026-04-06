import { NextResponse } from "next/server";
import { extractJSON } from "@/lib/extractJSON";
import { buildIndex } from "@/lib/repo-intel/symbolIndexer";
import { buildDependencyGraph } from "@/lib/repo-intel/dependencyGraph";
import {
  buildContext,
  buildContextSummary,
} from "@/lib/repo-intel/contextBuilder";
import { buildEmbeddingIndex } from "@/lib/repo-intel/embeddingEngine";
import type { RepoFile } from "@/lib/repo-intel/repoScanner";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are a world-class documentation modifier powered by deep code intelligence. You have access to precisely selected, verified source code — including exact function bodies, type definitions, and dependency chains.

You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON.

If the user asks about something that does NOT appear anywhere in the provided source code files, respond with:
{ "needsMoreFiles": true, "searchHint": "<short keyword or topic to search for in the repo>" }
This tells the system to search the repo for more relevant files and retry. Only set needsMoreFiles when the provided code genuinely does not contain what the user is asking about.

MODE "add" - Generate only new docItems to APPEND to the existing doc. Do NOT repeat existing items:
{
  "docItems": [
    { "style": "text-xl font-bold ", "text": "New Section from Code" },
    { "style": "btn-blue", "text": "Explanation based on code" },
    { "style": "code", "text": "relevant code snippet" }
  ]
}

MODE "modify" - Return ONLY the changes needed as an operations array. Do NOT return unchanged items.

Existing items are listed with 0-based index numbers like [0], [1], etc.
Return a JSON object with an "operations" array. Each operation is one of:
- Replace an item: { "type": "replace", "index": <number>, "item": { "style": "...", "text": "..." } }
- Insert new items after a position: { "type": "insert_after", "index": <number>, "items": [{ "style": "...", "text": "..." }] }
  Use "index": -1 to insert at the very beginning of the doc.
- Delete an item: { "type": "delete", "index": <number> }

CRITICAL: Indices are 0-based and refer to the CURRENT item positions as listed. Only include operations for items you are actually changing, inserting, or deleting. Everything not mentioned stays exactly where it is. To insert at the very end, use the index of the last existing item.

STYLE GUIDE:
- "text-xl font-bold " = Section headers
- "btn-blue" = General explanations, what code does
- "btn-green" = Best practices, key features, solutions
- "btn-yellow" = Tips, things to note, dependencies
- "btn-orange" = Alternative approaches, context
- "btn-red" = Warnings, pitfalls, security concerns
- "code" = Code snippets from the repo — include the most important/illustrative parts

DOCUMENTATION QUALITY RULES:
- ONLY use information from the provided source code. Never invent function names, variables, imports, API routes, behaviors or any detail not in the code.
- The code has been precisely selected using symbol indexing and dependency analysis. Trust this context.
- When including code snippets, copy them VERBATIM from the provided code. Never paraphrase, shorten, or pseudo-code real source code.
- BE EXTREMELY THOROUGH. When the user asks about a topic, document every relevant function, type, pattern, and detail found in the provided code.
- Each docItem should contain a full, substantive explanation — not just a one-liner. Explain the what, why, and how.
- Create section headers for each major component, feature, or concept the user asks about.
- Include concrete details: function signatures, parameter types, state variables, route paths, data flow.
- Show important code blocks verbatim — key functions, types, configurations.
- Document relationships: how modules connect, what calls what, how data flows between components.
- When the user asks about "structure" or "how it works", break down every layer: architecture, API routes, components, state management, data models, auth, storage.
- Write like a senior developer creating official docs. Every sentence should add real information.
- For "add" mode: generate 10-30+ items covering the topic comprehensively.
- For "modify" mode: make substantial, detailed improvements — don't just tweak one word.
- You may reference the dependency information provided (imports, exports, usage chains) to explain code connections.
- NEVER give a shallow response. If the code is there, document it in full.
- ONLY return valid JSON, nothing else`,
};

export async function POST(req: Request) {
  try {
    const { existingDocItems, files, prompt, mode } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    if (!mode || !["add", "modify"].includes(mode)) {
      return NextResponse.json(
        { error: "mode must be 'add' or 'modify'" },
        { status: 400 },
      );
    }

    // --- Intelligence Engine: Index + Analyze + Build Context ---

    // Convert raw file data to RepoFile format
    const repoFiles: RepoFile[] = (files || [])
      .filter((f: { content: string }) => f.content)
      .map((f: { path: string; content: string }) => {
        const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
        const langMap: Record<string, string> = {
          ".ts": "typescript", ".tsx": "typescript",
          ".js": "javascript", ".jsx": "javascript",
          ".py": "python", ".go": "go", ".rs": "rust",
          ".java": "java", ".kt": "kotlin", ".cs": "csharp",
          ".css": "css", ".scss": "scss", ".html": "html",
          ".json": "json", ".yaml": "yaml", ".yml": "yaml",
          ".md": "markdown", ".sql": "sql",
        };
        return {
          path: f.path,
          content: f.content,
          size: f.content.length,
          language: langMap[ext] || "text",
        };
      });

    // Build symbol index
    const repoIndex = buildIndex(repoFiles);

    // Build dependency graph
    const depGraph = buildDependencyGraph(repoIndex);

    // Build embedding index for semantic search
    const embeddingIndex = buildEmbeddingIndex(repoIndex);

    // Build intelligent context for enrichment (architecture, deps, symbols)
    const context = buildContext(prompt, repoIndex, depGraph, {
      maxTokens: 18000,
      includeArchitecture: true,
      embeddingIndex,
    });

    const contextSummary = buildContextSummary(context);

    // Always include ALL provided files directly — they were already curated.
    // The intelligence pipeline above is used only for architecture/symbol/dependency enrichment.
    const rawFileContents = repoFiles
      .map((f) => `// === ${f.path} ===\n${f.content}`)
      .join("\n\n");

    // --- Build the AI prompt ---

    let userContent = `Mode: ${mode}\nUser instructions: ${prompt}`;

    if (existingDocItems && existingDocItems.length > 0) {
      const indexed = existingDocItems
        .map(
          (item: { style: string; text: string }, i: number) =>
            `[${i}] (${item.style}) ${item.text}`,
        )
        .join("\n");
      userContent += `\n\nExisting doc items:\n${indexed}`;
    }

    // Add intelligence enrichment + ALL raw file code
    userContent += `\n\n## Intelligence Analysis\n${contextSummary}\n\n`;
    userContent += `## Source Code (${repoFiles.length} files)\n\n`;
    userContent += rawFileContents;

    // Token estimate
    const estimatedTokens = Math.ceil(
      (SYSTEM_PROMPT.content.length + userContent.length) / 4,
    );

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
          max_tokens: 8192,
        }),
      },
    );

    const status = proxied.status;
    const text = await proxied.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse provider response", providerStatus: status },
        { status: 502 },
      );
    }

    if (!proxied.ok) {
      if (status === 429) {
        const retryAfter =
          data?.error?.message?.match(/try again in (\d+\.?\d*s)/)?.[1];
        return NextResponse.json(
          {
            error: "Rate limited by AI provider",
            retryAfter: retryAfter || "60s",
            rateLimited: true,
          },
          { status: 429 },
        );
      }
      const errText = data?.error?.message || "";
      if (
        errText.includes("Request too large") ||
        errText.includes("tokens per minute")
      ) {
        const requestedMatch = errText.match(/Requested (\d+)/);
        const limitMatch = errText.match(/Limit (\d+)/);
        return NextResponse.json(
          {
            error: "Request too large for AI model",
            tooLarge: true,
            requestedTokens: requestedMatch
              ? parseInt(requestedMatch[1])
              : null,
            limit: limitMatch ? parseInt(limitMatch[1]) : 30000,
          },
          { status: 413 },
        );
      }
      return NextResponse.json(
        {
          error: data?.error?.message || "AI provider error",
          providerStatus: status,
        },
        { status: 502 },
      );
    }

    const rawReply =
      data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;

    if (!rawReply) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 },
      );
    }

    const { parsed, error: jsonError } = extractJSON(rawReply);
    if (jsonError || parsed === null) {
      return NextResponse.json(
        { error: "AI returned invalid JSON", detail: jsonError, raw: rawReply },
        { status: 502 },
      );
    }

    return NextResponse.json({
      result: parsed,
      estimatedTokens,
      intel: {
        filesAnalyzed: repoFiles.length,
        symbolsIndexed: repoIndex.allSymbols.length,
        contextFiles: context.includedFiles.length,
        contextTokens: context.totalTokens,
        symbolsFound: context.symbolsFound.slice(0, 10),
      },
    });
  } catch (err) {
    console.error("Error in github-import/intel-modify:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
