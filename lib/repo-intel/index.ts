/**
 * Repository Intelligence Engine — barrel export.
 *
 * Usage:
 *   import { scanRepo, buildIndex, buildDependencyGraph, buildContext } from "@/lib/repo-intel";
 */

// --- Scanner ---
export { fetchRepoTree, fetchFileContents, scanRepo } from "./repoScanner";
export type { RepoFile, ScanResult } from "./repoScanner";

// --- AST Parser ---
export { parseFile, parseFiles } from "./astParser";
export type {
  ParsedSymbol,
  ParsedImport,
  ParsedExport,
  ParsedFile,
  FrameworkHint,
} from "./astParser";

// --- Symbol Indexer ---
export { indexFile, buildIndex } from "./symbolIndexer";
export type {
  SymbolKind,
  CodeSymbol,
  FileIndex,
  ImportDecl,
  RepoIndex,
} from "./symbolIndexer";

// --- Dependency Graph ---
export {
  buildDependencyGraph,
  traceTransitiveDependencies,
  traceTransitiveDependents,
  traceSymbolUsage,
} from "./dependencyGraph";
export type { DependencyEdge, DependencyGraph } from "./dependencyGraph";

// --- Embedding Engine ---
export {
  buildEmbeddingIndex,
  searchEmbeddings,
  hybridSearch,
} from "./embeddingEngine";
export type {
  CodeEmbedding,
  EmbeddingIndex,
  SearchResult,
} from "./embeddingEngine";

// --- Vector Search ---
export { semanticSearch, findSymbol } from "./vectorSearch";
export type { SemanticSearchResult, SearchContext } from "./vectorSearch";

// --- Architecture Map ---
export {
  generateArchitectureMap,
  formatArchitectureForAI,
} from "./architectureMap";
export type {
  ArchLayer,
  ArchFile,
  DataFlow,
  ArchitectureMap,
} from "./architectureMap";

// --- Context Builder ---
export {
  buildContext,
  buildContextSummary,
  assembleContextText,
} from "./contextBuilder";
export type { ContextChunk, BuiltContext } from "./contextBuilder";
