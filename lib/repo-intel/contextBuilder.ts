/**
 * contextBuilder.ts — The brain of the intelligence engine.
 * Given a user prompt, the repo index, dependency graph, and
 * embedding index, selects the most relevant code using hybrid
 * BM25 + keyword scoring & assembles a precise, token-budget-aware
 * context payload for the AI.
 */

import type { RepoIndex, CodeSymbol, FileIndex } from "./symbolIndexer";
import type { DependencyGraph } from "./dependencyGraph";
import { traceTransitiveDependencies } from "./dependencyGraph";
import type { EmbeddingIndex } from "./embeddingEngine";
import { buildEmbeddingIndex, hybridSearch } from "./embeddingEngine";
import { generateArchitectureMap, formatArchitectureForAI } from "./architectureMap";

// ---------- Types ----------

export interface ContextChunk {
  filePath: string;
  content: string; // exact code
  reason: string; // why this was included
  tokens: number;
}

export interface BuiltContext {
  chunks: ContextChunk[];
  totalTokens: number;
  includedFiles: string[];
  symbolsFound: string[];
  truncated: boolean;
  architectureSummary?: string;
}

// ---------- Helpers ----------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract keywords from a user prompt for symbol matching.
 * Strips common English words and keeps identifiers/technical terms.
 */
function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "but", "and", "or",
    "not", "no", "nor", "if", "then", "else", "when", "up", "out",
    "this", "that", "these", "those", "it", "its", "my", "your", "our",
    "their", "he", "she", "we", "they", "me", "him", "her", "us", "them",
    "what", "which", "who", "whom", "where", "how", "why",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "than", "too", "very", "just", "about", "also",
    "so", "get", "set", "use", "make", "show", "add", "like",
    "i", "you", "file", "code", "function", "method", "class",
  ]);

  const words = prompt
    .replace(/[^a-zA-Z0-9_]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.toLowerCase())
    .filter((w) => !stopWords.has(w));

  // Also extract camelCase/PascalCase parts
  const camelParts: string[] = [];
  for (const w of words) {
    const parts = w.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
    if (parts.length > 1) {
      camelParts.push(...parts.map((p) => p.toLowerCase()));
    }
  }

  return [...new Set([...words, ...camelParts])];
}

/**
 * Score a symbol based on keyword match + JSDoc + call graph relevance.
 */
function scoreSymbol(symbol: CodeSymbol, keywords: string[]): number {
  let score = 0;
  const nameLower = symbol.name.toLowerCase();
  const sigLower = symbol.signature.toLowerCase();
  const pathLower = symbol.filePath.toLowerCase();
  const jsdocLower = symbol.jsdoc?.toLowerCase() || "";

  for (const kw of keywords) {
    // Exact name match — highest relevance
    if (nameLower === kw) score += 10;
    // Name contains keyword
    else if (nameLower.includes(kw)) score += 5;
    // Signature contains keyword
    if (sigLower.includes(kw)) score += 2;
    // JSDoc contains keyword
    if (jsdocLower.includes(kw)) score += 3;
    // File path contains keyword
    if (pathLower.includes(kw)) score += 1;
    // Parameters or return type contain keyword
    if (symbol.parameters.some((p) => p.toLowerCase().includes(kw))) score += 2;
    if (symbol.returnType.toLowerCase().includes(kw)) score += 2;
  }

  // Boost exported symbols
  if (symbol.exported) score += 1;
  // Boost route handlers
  if (symbol.kind === "route_handler") score += 2;
  // Boost components
  if (symbol.kind === "component") score += 1;
  // Small boost for symbols with JSDoc (well-documented = important)
  if (symbol.jsdoc) score += 0.5;

  return score;
}

/**
 * Score a file based on how relevant it is to the user's prompt.
 */
function scoreFile(file: FileIndex, keywords: string[]): number {
  let score = 0;
  const pathLower = file.path.toLowerCase();

  for (const kw of keywords) {
    if (pathLower.includes(kw)) score += 3;
  }

  // Sum the best symbol scores in this file
  for (const sym of file.symbols) {
    score += scoreSymbol(sym, keywords);
  }

  return score;
}

// ---------- Public API ----------

/**
 * Build an AI context from the repo index, selecting the most relevant
 * code for the given user prompt within a token budget.
 * Now uses hybrid BM25 search + keyword scoring + call graph tracing.
 */
export function buildContext(
  prompt: string,
  index: RepoIndex,
  graph: DependencyGraph,
  options: {
    maxTokens?: number;
    includeArchitecture?: boolean;
    targetFiles?: string[];
    targetSymbols?: string[];
    embeddingIndex?: EmbeddingIndex; // pass pre-built index for reuse
  } = {}
): BuiltContext {
  const maxTokens = options.maxTokens ?? 18000;
  const chunks: ContextChunk[] = [];
  let totalTokens = 0;
  const includedPaths = new Set<string>();
  const symbolsFound: string[] = [];
  let architectureSummary: string | undefined;

  // Build or reuse embedding index for semantic search
  const embIdx = options.embeddingIndex ?? buildEmbeddingIndex(index);

  // --- Step 1: Full architecture overview ---
  if (options.includeArchitecture !== false) {
    const archMap = generateArchitectureMap(index, graph);
    const archText = formatArchitectureForAI(archMap);
    architectureSummary = archMap.summary;
    const archTokens = estimateTokens(archText);
    if (archTokens < maxTokens * 0.15) {
      chunks.push({
        filePath: "__architecture__",
        content: archText,
        reason: "architecture overview with layers and data flow",
        tokens: archTokens,
      });
      totalTokens += archTokens;
    }
  }

  // --- Step 2: Forced inclusions (targetFiles / targetSymbols) ---
  if (options.targetFiles) {
    for (const path of options.targetFiles) {
      const file = index.fileMap.get(path);
      if (!file || includedPaths.has(path)) continue;
      const fileContent = formatFileForContext(file);
      const tokens = estimateTokens(fileContent);
      if (totalTokens + tokens > maxTokens) continue;
      chunks.push({ filePath: path, content: fileContent, reason: "explicitly requested file", tokens });
      totalTokens += tokens;
      includedPaths.add(path);
    }
  }

  if (options.targetSymbols) {
    for (const name of options.targetSymbols) {
      const syms = index.symbolMap.get(name);
      if (!syms) continue;
      for (const sym of syms) {
        symbolsFound.push(`${sym.name} (${sym.kind}) in ${sym.filePath}`);
        if (includedPaths.has(sym.filePath)) continue;
        const tokens = estimateTokens(sym.code);
        if (totalTokens + tokens > maxTokens) continue;
        chunks.push({
          filePath: sym.filePath,
          content: formatSymbolForContext(sym),
          reason: `contains requested symbol: ${sym.name}`,
          tokens,
        });
        totalTokens += tokens;
        includedPaths.add(sym.filePath);
      }
    }
  }

  // --- Step 3: BM25 semantic search (primary retrieval) ---
  const semanticResults = hybridSearch(prompt, embIdx, 30);

  // Deduplicate and track which symbols/files the BM25 engine found
  const semanticSymbols = new Set<string>(); // "filePath:symbolName"
  const semanticFiles = new Set<string>();

  for (const result of semanticResults) {
    if (result.embedding.type === "symbol" && result.embedding.symbolName) {
      semanticSymbols.add(`${result.embedding.filePath}:${result.embedding.symbolName}`);
    } else {
      semanticFiles.add(result.embedding.filePath);
    }
  }

  // --- Step 4: Keyword-based scoring (secondary signal) ---
  const keywords = extractKeywords(prompt);

  // Combine BM25 results with keyword scoring
  const symbolScores = new Map<string, { sym: CodeSymbol; score: number }>();

  // Score from BM25
  for (const result of semanticResults) {
    if (result.embedding.type === "symbol" && result.embedding.symbolName) {
      const syms = index.symbolMap.get(result.embedding.symbolName);
      const sym = syms?.find((s) => s.filePath === result.embedding.filePath);
      if (sym) {
        const key = `${sym.filePath}:${sym.name}`;
        const kwScore = scoreSymbol(sym, keywords);
        // Combine BM25 score (normalized to ~10) with keyword score
        symbolScores.set(key, { sym, score: result.score * 10 + kwScore });
      }
    }
  }

  // Also add keyword-only matches not found by BM25
  for (const sym of index.allSymbols) {
    const key = `${sym.filePath}:${sym.name}`;
    if (symbolScores.has(key)) continue;
    const kwScore = scoreSymbol(sym, keywords);
    if (kwScore > 3) {
      symbolScores.set(key, { sym, score: kwScore });
    }
  }

  // Sort by combined score
  const rankedSymbols = Array.from(symbolScores.values())
    .sort((a, b) => b.score - a.score);

  // --- Step 5: Add top symbols with call graph context ---
  const addedSymbolKeys = new Set<string>();

  for (const { sym, score } of rankedSymbols) {
    if (totalTokens >= maxTokens * 0.7) break; // Reserve 30% for deps + files
    const key = `${sym.filePath}:${sym.name}`;
    if (addedSymbolKeys.has(key)) continue;

    const symContent = formatSymbolForContext(sym);
    const tokens = estimateTokens(symContent);
    if (totalTokens + tokens > maxTokens) continue;

    symbolsFound.push(`${sym.name} (${sym.kind}, score: ${score.toFixed(1)}) in ${sym.filePath}`);
    chunks.push({
      filePath: sym.filePath,
      content: symContent,
      reason: `relevant symbol (score: ${score.toFixed(1)}): ${sym.name}`,
      tokens,
    });
    totalTokens += tokens;
    addedSymbolKeys.add(key);
    includedPaths.add(sym.filePath);

    // Follow call graph: add symbols this one calls (1 level deep)
    const calls = index.callGraph.get(sym.name) || [];
    for (const callName of calls.slice(0, 5)) {
      const callSyms = index.symbolMap.get(callName);
      if (!callSyms) continue;
      for (const callSym of callSyms) {
        const callKey = `${callSym.filePath}:${callSym.name}`;
        if (addedSymbolKeys.has(callKey)) continue;
        const callContent = formatSymbolForContext(callSym);
        const callTokens = estimateTokens(callContent);
        if (totalTokens + callTokens > maxTokens * 0.8) break;
        chunks.push({
          filePath: callSym.filePath,
          content: callContent,
          reason: `called by ${sym.name}`,
          tokens: callTokens,
        });
        totalTokens += callTokens;
        addedSymbolKeys.add(callKey);
        includedPaths.add(callSym.filePath);
      }
    }
  }

  // --- Step 6: Add dependency chain context for included files ---
  const depPaths = new Set<string>();
  for (const path of includedPaths) {
    const deps = traceTransitiveDependencies(graph, path, 2);
    deps.forEach((d) => depPaths.add(d));
  }

  for (const depPath of depPaths) {
    if (includedPaths.has(depPath)) continue;
    if (totalTokens >= maxTokens * 0.9) break;

    const file = index.fileMap.get(depPath);
    if (!file || file.symbols.length === 0) continue;

    const summary = formatFileSignatures(file);
    const tokens = estimateTokens(summary);
    if (totalTokens + tokens > maxTokens) continue;

    chunks.push({
      filePath: depPath,
      content: summary,
      reason: "dependency of included file (signatures only)",
      tokens,
    });
    totalTokens += tokens;
    includedPaths.add(depPath);
  }

  // --- Step 7: Fill remaining budget with BM25-ranked files ---
  const scoredFiles = index.files
    .map((f) => ({ file: f, score: scoreFile(f, keywords) + (semanticFiles.has(f.path) ? 5 : 0) }))
    .filter((s) => s.score > 0 && !includedPaths.has(s.file.path))
    .sort((a, b) => b.score - a.score);

  for (const { file, score } of scoredFiles) {
    if (totalTokens >= maxTokens) break;

    const fileContent = formatFileForContext(file);
    const tokens = estimateTokens(fileContent);
    if (totalTokens + tokens > maxTokens) continue;

    chunks.push({
      filePath: file.path,
      content: fileContent,
      reason: `relevant file (score: ${score})`,
      tokens,
    });
    totalTokens += tokens;
    includedPaths.add(file.path);
  }

  return {
    chunks,
    totalTokens,
    includedFiles: Array.from(includedPaths),
    symbolsFound,
    truncated: totalTokens >= maxTokens,
    architectureSummary,
  };
}

// ---------- Formatting ----------

/**
 * Format a symbol with JSDoc, location, and code for AI context.
 */
function formatSymbolForContext(sym: CodeSymbol): string {
  const lines: string[] = [];
  if (sym.jsdoc) {
    lines.push(sym.jsdoc);
  }
  lines.push(`// ${sym.filePath}:${sym.startLine}-${sym.endLine}`);
  lines.push(sym.code);
  return lines.join("\n");
}

/**
 * Format a file's symbols as full code for AI context.
 */
function formatFileForContext(file: FileIndex): string {
  const lines: string[] = [`// === ${file.path} ===`];

  // Include imports
  for (const imp of file.imports) {
    const typePrefix = imp.isTypeOnly ? "type " : "";
    lines.push(`import ${typePrefix}{ ${imp.names.join(", ")} } from "${imp.source}";`);
  }
  if (file.imports.length > 0) lines.push("");

  // Include all symbols (with JSDoc)
  for (const sym of file.symbols) {
    if (sym.jsdoc) lines.push(sym.jsdoc);
    lines.push(sym.code);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format only the signatures of a file's symbols (compact summary).
 */
function formatFileSignatures(file: FileIndex): string {
  const lines: string[] = [`// === ${file.path} (signatures) ===`];
  for (const sym of file.symbols) {
    const prefix = sym.exported ? "export " : "";
    lines.push(`${prefix}${sym.signature};`);
  }
  return lines.join("\n");
}

/**
 * Build a compact "what was found" summary for diagnostics.
 */
export function buildContextSummary(ctx: BuiltContext): string {
  const lines: string[] = [
    `Context: ${ctx.chunks.length} code chunks, ${ctx.totalTokens} tokens, ${ctx.includedFiles.length} files`,
  ];
  if (ctx.symbolsFound.length > 0) {
    lines.push(`Symbols found: ${ctx.symbolsFound.slice(0, 20).join(", ")}`);
  }
  if (ctx.architectureSummary) {
    lines.push(`Architecture: ${ctx.architectureSummary}`);
  }
  if (ctx.truncated) {
    lines.push("(context was truncated to fit token budget)");
  }
  return lines.join("\n");
}

/**
 * Assemble the full context text for an AI prompt.
 */
export function assembleContextText(ctx: BuiltContext): string {
  return ctx.chunks.map((c) => c.content).join("\n\n");
}
