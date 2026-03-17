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
  content: `You are an elite documentation modifier powered by deep code intelligence. You have access to precisely selected, verified source code — including exact function bodies, type definitions, and dependency chains.

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

RULES:
- ONLY use information that appears in the provided source code files. Never invent function names, variable names, imports, API routes, behaviors, or any detail not present in the code.
- The code provided has been precisely selected from the repository using symbol indexing and dependency analysis. Trust this context — it includes the exact functions, types, and dependency chains relevant to the user's request.
- When the user asks about a specific function, hook, component, class, or code block, find it in the provided code and include the COMPLETE function/block as a code item — do NOT summarize or abbreviate it.
- When including code snippets, always copy them VERBATIM from the provided code. Never paraphrase, shorten, or pseudo-code real source code.
- You may reference the dependency information provided (imports, exports, usage chains) to explain how code connects and flows.
- Write like a knowledgeable developer explaining code to a teammate.
- Use a natural mix of styles for visual interest.
- Keep explanation items concise but informative. Code items should be complete and exact.
- For "modify" mode: preserve ALL existing items unless the user explicitly says to change them.
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

    // Build intelligent context — uses BM25 search + architecture + call graph
    const context = buildContext(prompt, repoIndex, depGraph, {
      maxTokens: 18000,
      includeArchitecture: true,
      embeddingIndex,
    });

    const contextText = assembleContextText(context);
    const contextSummary = buildContextSummary(context);

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

    // Add intelligence context instead of raw file dumps
    userContent += `\n\n## Analyzed Source Code (${context.includedFiles.length} files, ${context.totalTokens} tokens)\n`;
    userContent += `Intelligence summary: ${contextSummary}\n\n`;
    userContent += contextText;

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
