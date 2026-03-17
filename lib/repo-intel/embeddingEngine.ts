/**
 * embeddingEngine.ts — TF-IDF + BM25 based code embedding engine.
 * Generates sparse vector representations of code symbols and files
 * for highly effective code search without external API dependencies.
 *
 * This is a production-grade approach used by many code search systems.
 * BM25 significantly outperforms naive keyword matching for code retrieval.
 */

import type { CodeSymbol, RepoIndex, FileIndex } from "./symbolIndexer";

// ---------- Types ----------

export interface CodeEmbedding {
  id: string;           // unique identifier: "file:path" or "sym:path:name"
  type: "file" | "symbol";
  filePath: string;
  symbolName?: string;
  symbolKind?: string;
  terms: Map<string, number>; // term → TF-IDF weight
  magnitude: number;          // vector magnitude for cosine similarity
  // Metadata for display
  signature?: string;
  startLine?: number;
  endLine?: number;
}

export interface EmbeddingIndex {
  embeddings: CodeEmbedding[];
  embeddingMap: Map<string, CodeEmbedding>; // id → embedding
  idf: Map<string, number>;                  // term → IDF value
  documentCount: number;
  avgDocLength: number;
}

export interface SearchResult {
  embedding: CodeEmbedding;
  score: number;
  matchedTerms: string[];
}

// ---------- BM25 Constants ----------

const BM25_K1 = 1.5;  // term frequency saturation
const BM25_B = 0.75;   // length normalization

// ---------- Tokenization ----------

/**
 * Tokenize code into meaningful terms for search.
 * Handles camelCase, snake_case, PascalCase splitting,
 * path components, and code-specific tokens.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // Split on non-alphanumeric boundaries
  const rawTokens = text.split(/[^a-zA-Z0-9_$]+/).filter(Boolean);

  for (const tok of rawTokens) {
    const lower = tok.toLowerCase();
    if (lower.length < 2) continue;
    tokens.push(lower);

    // Split camelCase and PascalCase
    const parts = tok.replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(" ");
    if (parts.length > 1) {
      for (const part of parts) {
        const p = part.toLowerCase();
        if (p.length >= 2) tokens.push(p);
      }
    }

    // Split snake_case
    if (tok.includes("_")) {
      const snakeParts = tok.split("_");
      for (const part of snakeParts) {
        const p = part.toLowerCase();
        if (p.length >= 2) tokens.push(p);
      }
    }
  }

  return tokens;
}

/**
 * Compute term frequencies for a document.
 */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

// ---------- Index Building ----------

/**
 * Build a document string for a symbol that captures all searchable information.
 */
function symbolToDocument(sym: CodeSymbol): string {
  const parts: string[] = [
    sym.name,
    sym.name, // double-weight the name
    sym.kind,
    sym.filePath,
    sym.signature,
    sym.jsdoc || "",
    ...sym.parameters,
    sym.returnType || "",
    ...sym.callsTo,
    ...sym.dependencies,
  ];
  // Include a portion of the code for content matching
  const codePreview = sym.code.substring(0, 2000);
  parts.push(codePreview);
  return parts.join(" ");
}

/**
 * Build a document string for a file.
 */
function fileToDocument(file: FileIndex): string {
  const parts: string[] = [
    file.path,
    file.language,
    ...file.exports,
    ...file.imports.map((i) => `${i.source} ${i.names.join(" ")}`),
  ];
  // Add symbol names and signatures
  for (const sym of file.symbols) {
    parts.push(sym.name);
    parts.push(sym.signature);
    if (sym.jsdoc) parts.push(sym.jsdoc);
  }
  return parts.join(" ");
}

/**
 * Build the embedding index from a repo index.
 */
export function buildEmbeddingIndex(repoIndex: RepoIndex): EmbeddingIndex {
  const embeddings: CodeEmbedding[] = [];
  const embeddingMap = new Map<string, CodeEmbedding>();

  // Phase 1: Collect all document TFs
  const allDocs: Array<{ id: string; tf: Map<string, number>; embedding: Partial<CodeEmbedding> }> = [];
  const dfMap = new Map<string, number>(); // term → document frequency

  // Index each symbol
  for (const sym of repoIndex.allSymbols) {
    const doc = symbolToDocument(sym);
    const tokens = tokenize(doc);
    const tf = computeTF(tokens);
    const id = `sym:${sym.filePath}:${sym.name}`;

    allDocs.push({
      id,
      tf,
      embedding: {
        id,
        type: "symbol",
        filePath: sym.filePath,
        symbolName: sym.name,
        symbolKind: sym.kind,
        signature: sym.signature,
        startLine: sym.startLine,
        endLine: sym.endLine,
      },
    });

    for (const term of tf.keys()) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
    }
  }

  // Index each file
  for (const file of repoIndex.files) {
    const doc = fileToDocument(file);
    const tokens = tokenize(doc);
    const tf = computeTF(tokens);
    const id = `file:${file.path}`;

    allDocs.push({
      id,
      tf,
      embedding: {
        id,
        type: "file",
        filePath: file.path,
      },
    });

    for (const term of tf.keys()) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
    }
  }

  // Phase 2: Compute IDF
  const N = allDocs.length;
  const idf = new Map<string, number>();
  for (const [term, df] of dfMap) {
    // BM25 IDF formula
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  // Phase 3: Compute TF-IDF weights and magnitudes
  const totalDocLength = allDocs.reduce((sum, d) => {
    let len = 0;
    for (const c of d.tf.values()) len += c;
    return sum + len;
  }, 0);
  const avgDocLength = totalDocLength / Math.max(N, 1);

  for (const docEntry of allDocs) {
    const terms = new Map<string, number>();
    let magnitude = 0;

    let docLength = 0;
    for (const c of docEntry.tf.values()) docLength += c;

    for (const [term, rawTf] of docEntry.tf) {
      const termIdf = idf.get(term) || 0;
      // BM25 score
      const numerator = rawTf * (BM25_K1 + 1);
      const denominator = rawTf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
      const weight = termIdf * (numerator / denominator);
      terms.set(term, weight);
      magnitude += weight * weight;
    }

    magnitude = Math.sqrt(magnitude);

    const embedding: CodeEmbedding = {
      ...docEntry.embedding as CodeEmbedding,
      terms,
      magnitude,
    };

    embeddings.push(embedding);
    embeddingMap.set(embedding.id, embedding);
  }

  return { embeddings, embeddingMap, idf, documentCount: N, avgDocLength };
}

// ---------- Search ----------

/**
 * Search the embedding index for the most relevant results.
 * Uses BM25 scoring with query-time TF-IDF weighting.
 */
export function searchEmbeddings(
  query: string,
  index: EmbeddingIndex,
  options: {
    maxResults?: number;
    typeFilter?: "file" | "symbol";
    minScore?: number;
  } = {},
): SearchResult[] {
  const maxResults = options.maxResults ?? 20;
  const minScore = options.minScore ?? 0.01;

  // Tokenize query
  const queryTokens = tokenize(query);
  const queryTF = computeTF(queryTokens);

  const results: SearchResult[] = [];

  for (const embedding of index.embeddings) {
    if (options.typeFilter && embedding.type !== options.typeFilter) continue;

    let score = 0;
    const matchedTerms: string[] = [];

    for (const [qTerm, qFreq] of queryTF) {
      const docWeight = embedding.terms.get(qTerm);
      if (docWeight !== undefined) {
        // Weight by query term frequency and document weight
        score += docWeight * qFreq;
        matchedTerms.push(qTerm);
      }

      // Also check for partial matches (substring matching for code identifiers)
      if (matchedTerms.length === 0 || !embedding.terms.has(qTerm)) {
        for (const [docTerm, docWeight2] of embedding.terms) {
          if (docTerm.includes(qTerm) || qTerm.includes(docTerm)) {
            score += docWeight2 * qFreq * 0.5; // partial match penalty
            if (!matchedTerms.includes(docTerm)) matchedTerms.push(docTerm);
          }
        }
      }
    }

    if (score >= minScore && matchedTerms.length > 0) {
      results.push({ embedding, score, matchedTerms });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults);
}

/**
 * Combined search: find relevant symbols AND files for a query.
 * Returns a deduplicated list sorted by relevance.
 */
export function hybridSearch(
  query: string,
  index: EmbeddingIndex,
  maxResults: number = 15,
): SearchResult[] {
  const symbolResults = searchEmbeddings(query, index, {
    maxResults: maxResults * 2,
    typeFilter: "symbol",
  });

  const fileResults = searchEmbeddings(query, index, {
    maxResults: maxResults,
    typeFilter: "file",
  });

  // Merge: prioritize symbol results but include file-level results
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const r of symbolResults) {
    if (!seen.has(r.embedding.id)) {
      seen.add(r.embedding.id);
      merged.push(r);
    }
  }

  for (const r of fileResults) {
    if (!seen.has(r.embedding.id)) {
      seen.add(r.embedding.id);
      // Slightly lower weight for file-level matches
      merged.push({ ...r, score: r.score * 0.8 });
    }
  }

  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, maxResults);
}
