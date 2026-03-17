/**
 * vectorSearch.ts — High-level semantic search interface for the
 * code intelligence engine. Combines BM25 embedding search with
 * symbol-aware re-ranking and code-context assembly.
 */

import type { RepoIndex, FileIndex } from "./symbolIndexer";
import type { DependencyGraph } from "./dependencyGraph";
import type { EmbeddingIndex } from "./embeddingEngine";
import { hybridSearch } from "./embeddingEngine";
import { traceTransitiveDependencies, traceSymbolUsage } from "./dependencyGraph";

// ---------- Types ----------

export interface SemanticSearchResult {
  type: "symbol" | "file";
  filePath: string;
  symbolName?: string;
  symbolKind?: string;
  signature?: string;
  code: string;
  startLine?: number;
  endLine?: number;
  score: number;
  matchedTerms: string[];
  relatedFiles: string[];       // files in the dependency chain
  usedBy: string[];             // symbols/files that use this
  jsdoc?: string;
}

export interface SearchContext {
  results: SemanticSearchResult[];
  totalResults: number;
  query: string;
}

// ---------- Public API ----------

/**
 * Perform a semantic search across the indexed repository.
 * Returns ranked, enriched results with dependency context.
 */
export function semanticSearch(
  query: string,
  repoIndex: RepoIndex,
  depGraph: DependencyGraph,
  embeddingIndex: EmbeddingIndex,
  options: {
    maxResults?: number;
    includeContext?: boolean;
  } = {},
): SearchContext {
  const maxResults = options.maxResults ?? 10;
  const includeContext = options.includeContext ?? true;

  // Phase 1: BM25 hybrid search
  const rawResults = hybridSearch(query, embeddingIndex, maxResults * 2);

  // Phase 2: Enrich with code and dependency context
  const enriched: SemanticSearchResult[] = [];

  for (const raw of rawResults) {
    const emb = raw.embedding;

    if (emb.type === "symbol" && emb.symbolName) {
      // Find the actual symbol in the index
      const symbols = repoIndex.symbolMap.get(emb.symbolName);
      const sym = symbols?.find((s) => s.filePath === emb.filePath);
      if (!sym) continue;

      let relatedFiles: string[] = [];
      let usedBy: string[] = [];

      if (includeContext) {
        relatedFiles = traceTransitiveDependencies(depGraph, emb.filePath, 2);
        const usage = traceSymbolUsage(emb.symbolName, repoIndex, depGraph);
        usedBy = usage.map((u) => u.file);
      }

      enriched.push({
        type: "symbol",
        filePath: sym.filePath,
        symbolName: sym.name,
        symbolKind: sym.kind,
        signature: sym.signature,
        code: sym.code,
        startLine: sym.startLine,
        endLine: sym.endLine,
        score: raw.score,
        matchedTerms: raw.matchedTerms,
        relatedFiles,
        usedBy,
        jsdoc: sym.jsdoc,
      });
    } else if (emb.type === "file") {
      const file = repoIndex.fileMap.get(emb.filePath);
      if (!file) continue;

      let relatedFiles: string[] = [];
      if (includeContext) {
        relatedFiles = traceTransitiveDependencies(depGraph, emb.filePath, 2);
      }

      // Build a compact code representation for file matches
      const code = buildFilePreview(file);

      enriched.push({
        type: "file",
        filePath: emb.filePath,
        code,
        score: raw.score,
        matchedTerms: raw.matchedTerms,
        relatedFiles,
        usedBy: [],
      });
    }
  }

  // Phase 3: Re-rank with additional signals
  enriched.sort((a, b) => {
    let scoreA = a.score;
    let scoreB = b.score;

    // Boost exported symbols
    if (a.type === "symbol") scoreA *= 1.2;
    if (b.type === "symbol") scoreB *= 1.2;

    // boost route handlers and components
    if (a.symbolKind === "route_handler") scoreA *= 1.5;
    if (b.symbolKind === "route_handler") scoreB *= 1.5;
    if (a.symbolKind === "component") scoreA *= 1.3;
    if (b.symbolKind === "component") scoreB *= 1.3;

    return scoreB - scoreA;
  });

  const results = enriched.slice(0, maxResults);

  return {
    results,
    totalResults: rawResults.length,
    query,
  };
}

/**
 * Find a specific symbol by name across the entire repo.
 * Returns all occurrences with full context.
 */
export function findSymbol(
  name: string,
  repoIndex: RepoIndex,
  depGraph: DependencyGraph,
): SemanticSearchResult[] {
  const symbols = repoIndex.symbolMap.get(name) || [];
  return symbols.map((sym) => {
    const relatedFiles = traceTransitiveDependencies(depGraph, sym.filePath, 2);
    const usage = traceSymbolUsage(sym.name, repoIndex, depGraph);

    return {
      type: "symbol" as const,
      filePath: sym.filePath,
      symbolName: sym.name,
      symbolKind: sym.kind,
      signature: sym.signature,
      code: sym.code,
      startLine: sym.startLine,
      endLine: sym.endLine,
      score: 1.0,
      matchedTerms: [name],
      relatedFiles,
      usedBy: usage.map((u) => u.file),
      jsdoc: sym.jsdoc,
    };
  });
}

// ---------- Helpers ----------

function buildFilePreview(file: FileIndex): string {
  const lines: string[] = [];
  lines.push(`// === ${file.path} ===`);

  // Compact import summary
  if (file.imports.length > 0) {
    const importSources = [...new Set(file.imports.map((i) => i.source))];
    lines.push(`// Imports from: ${importSources.join(", ")}`);
  }

  // List all symbol signatures
  for (const sym of file.symbols) {
    const prefix = sym.exported ? "export " : "";
    lines.push(`${prefix}${sym.signature}`);
  }

  return lines.join("\n");
}
