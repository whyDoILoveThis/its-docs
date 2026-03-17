import { NextResponse } from "next/server";
import { buildIndex } from "@/lib/repo-intel/symbolIndexer";
import { buildDependencyGraph } from "@/lib/repo-intel/dependencyGraph";
import {
  buildContext,
  assembleContextText,
  buildContextSummary,
} from "@/lib/repo-intel/contextBuilder";
import { buildEmbeddingIndex } from "@/lib/repo-intel/embeddingEngine";
import {
  generateArchitectureMap,
  formatArchitectureForAI,
} from "@/lib/repo-intel/architectureMap";
import { semanticSearch, findSymbol } from "@/lib/repo-intel/vectorSearch";
import type { RepoFile } from "@/lib/repo-intel/repoScanner";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are an elite code intelligence assistant with deep knowledge of the codebase provided. You have access to precisely selected, verified source code — including exact function bodies, type definitions, dependency chains, and architecture context.

RULES:
- ONLY use information from the provided source code. Never invent function names, variables, imports, or behaviors.
- When referencing code, cite the exact file path and line numbers.
- When asked "where is X?", point to the exact file and function/component.
- When asked "what happens if I change X?", trace the dependency chain using the provided dependency and usage information.
- When asked "how does X work?", walk through the actual code step by step.
- When asked to explain architecture, use the architecture overview provided.
- Be precise and concise. Don't pad answers.
- If the answer isn't in the provided code, say so honestly.

FORMAT: Respond in clear markdown with code blocks where appropriate. Use file paths and line references when citing code.`,
};

/**
 * Detect the intent of the query to optimize context retrieval.
 */
function detectQueryIntent(query: string): {
  type: "find" | "explain" | "impact" | "architecture" | "general";
  symbolName?: string;
} {
  const q = query.toLowerCase();

  // "Where is X?" / "Find X" / "Show me X"
  const findMatch = query.match(
    /(?:where\s+is|find|show\s+me|locate|look\s+for)\s+(?:the\s+)?[`"']?(\w+)[`"']?/i,
  );
  if (findMatch) {
    return { type: "find", symbolName: findMatch[1] };
  }

  // "What would break/change if..." / "Impact of changing..."
  if (
    q.includes("break") ||
    q.includes("impact") ||
    q.includes("what would happen") ||
    q.includes("what happens if") ||
    q.includes("affect")
  ) {
    const impactMatch = query.match(
      /(?:chang|modify|remov|delet|renam)\w*\s+(?:the\s+)?[`"']?(\w+)[`"']?/i,
    );
    return { type: "impact", symbolName: impactMatch?.[1] };
  }

  // Architecture questions
  if (
    q.includes("architecture") ||
    q.includes("structure") ||
    q.includes("overview") ||
    q.includes("how is the project organized") ||
    q.includes("layers")
  ) {
    return { type: "architecture" };
  }

  // "How does X work?" / "Explain X"
  const explainMatch = query.match(
    /(?:how\s+does|explain|describe|what\s+does|what\s+is)\s+(?:the\s+)?[`"']?(\w+)[`"']?/i,
  );
  if (explainMatch) {
    return { type: "explain", symbolName: explainMatch[1] };
  }

  return { type: "general" };
}

export async function POST(req: Request) {
  try {
    const { files, query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 },
      );
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "files array is required" },
        { status: 400 },
      );
    }

    // --- Build full intelligence pipeline ---
    const repoFiles: RepoFile[] = files
      .filter((f: { content: string }) => f.content)
      .map((f: { path: string; content: string }) => {
        const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
        const langMap: Record<string, string> = {
          ".ts": "typescript",
          ".tsx": "typescript",
          ".js": "javascript",
          ".jsx": "javascript",
          ".py": "python",
          ".go": "go",
          ".rs": "rust",
          ".java": "java",
          ".kt": "kotlin",
          ".cs": "csharp",
          ".css": "css",
          ".scss": "scss",
          ".html": "html",
          ".json": "json",
          ".yaml": "yaml",
          ".yml": "yaml",
          ".md": "markdown",
          ".sql": "sql",
        };
        return {
          path: f.path,
          content: f.content,
          size: f.content.length,
          language: langMap[ext] || "text",
        };
      });

    const repoIndex = buildIndex(repoFiles);
    const depGraph = buildDependencyGraph(repoIndex);
    const embeddingIndex = buildEmbeddingIndex(repoIndex);

    // --- Intent detection for optimized context ---
    const intent = detectQueryIntent(query);

    let userContent = `**Query:** ${query}\n\n`;

    // Add architecture context for architecture queries
    if (intent.type === "architecture") {
      const archMap = generateArchitectureMap(repoIndex, depGraph);
      userContent += formatArchitectureForAI(archMap) + "\n\n";
    }

    // For "find" queries, do a direct symbol lookup
    if (intent.type === "find" && intent.symbolName) {
      const found = findSymbol(intent.symbolName, repoIndex, depGraph);
      if (found.length > 0) {
        userContent += `**Direct symbol matches for "${intent.symbolName}":**\n`;
        for (const r of found.slice(0, 5)) {
          userContent += `- ${r.symbolName} (${r.symbolKind}) in ${r.filePath}:${r.startLine}\n`;
          if (r.usedBy.length > 0) {
            userContent += `  Used by: ${r.usedBy.join(", ")}\n`;
          }
        }
        userContent += "\n";
      }
    }

    // For "impact" queries, trace dependencies
    if (intent.type === "impact" && intent.symbolName) {
      const found = findSymbol(intent.symbolName, repoIndex, depGraph);
      if (found.length > 0) {
        userContent += `**Impact analysis for "${intent.symbolName}":**\n`;
        for (const r of found) {
          if (r.usedBy.length > 0) {
            userContent += `- ${r.filePath}: used by ${r.usedBy.length} files: ${r.usedBy.join(", ")}\n`;
          }
          if (r.relatedFiles.length > 0) {
            userContent += `- Depends on: ${r.relatedFiles.join(", ")}\n`;
          }
        }
        userContent += "\n";
      }
    }

    // Semantic search for supporting context
    const searchResults = semanticSearch(
      query,
      repoIndex,
      depGraph,
      embeddingIndex,
      { maxResults: 8 },
    );

    if (searchResults.results.length > 0) {
      userContent += `**Semantic search results (${searchResults.totalResults} total matches):**\n`;
      for (const r of searchResults.results) {
        if (r.type === "symbol") {
          userContent += `- ${r.symbolName} (${r.symbolKind}) in ${r.filePath}\n`;
        } else {
          userContent += `- File: ${r.filePath}\n`;
        }
      }
      userContent += "\n";
    }

    // Build full code context
    const context = buildContext(query, repoIndex, depGraph, {
      maxTokens: 18000,
      includeArchitecture: intent.type !== "architecture",
      targetSymbols: intent.symbolName ? [intent.symbolName] : undefined,
      embeddingIndex,
    });

    userContent += `## Source Code Context (${context.includedFiles.length} files, ${context.totalTokens} tokens)\n\n`;
    userContent += assembleContextText(context);

    const messages = [SYSTEM_PROMPT, { role: "user", content: userContent }];

    // --- Call AI ---
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
          temperature: 0.3,
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
        return NextResponse.json(
          { error: "Request too large for AI model", tooLarge: true },
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

    const reply =
      data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;

    if (!reply) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      answer: reply,
      intel: {
        intent: intent.type,
        symbolTarget: intent.symbolName || null,
        filesAnalyzed: repoFiles.length,
        symbolsIndexed: repoIndex.allSymbols.length,
        contextFiles: context.includedFiles.length,
        contextTokens: context.totalTokens,
        searchResultCount: searchResults.totalResults,
        symbolsFound: context.symbolsFound.slice(0, 10),
        summary: buildContextSummary(context),
      },
    });
  } catch (err) {
    console.error("Error in github-import/query:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
