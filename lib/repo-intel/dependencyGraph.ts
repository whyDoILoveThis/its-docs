/**
 * dependencyGraph.ts — Builds an import/export dependency graph
 * from the indexed symbols and files. Enables tracing how code
 * flows from route → handler → service → model/util.
 */

import type { RepoIndex, CodeSymbol } from "./symbolIndexer";

// ---------- Types ----------

export interface DependencyEdge {
  from: string; // file path of importer
  to: string; // file path or module specifier of importee
  names: string[]; // imported symbol names
  isExternal: boolean; // whether it's a node_modules / external import
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  /** Files that import a given file path */
  dependentsOf: Map<string, DependencyEdge[]>;
  /** Files imported by a given file path */
  dependenciesOf: Map<string, DependencyEdge[]>;
}

// ---------- Path resolution ----------

/**
 * Attempt to resolve an import specifier to a file path in the index.
 * Handles:
 *  - @/ alias → root-relative
 *  - Relative imports (./foo, ../bar)
 *  - Index files (foo/ → foo/index.ts)
 *  - Extension-less imports
 */
function resolveImport(
  importSource: string,
  importerPath: string,
  filePaths: Set<string>
): string | null {
  let resolved = importSource;

  // Handle @/ alias (common Next.js pattern)
  if (resolved.startsWith("@/")) {
    resolved = resolved.slice(2);
  } else if (resolved.startsWith("./") || resolved.startsWith("../")) {
    // Resolve relative to importer directory
    const importerDir = importerPath.split("/").slice(0, -1).join("/");
    const parts = [...importerDir.split("/"), ...resolved.split("/")];
    const stack: string[] = [];
    for (const p of parts) {
      if (p === "." || p === "") continue;
      if (p === "..") { stack.pop(); continue; }
      stack.push(p);
    }
    resolved = stack.join("/");
  } else {
    // External package import — not resolvable
    return null;
  }

  // Try exact match, then with common extensions, then as index file
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  for (const ext of exts) {
    if (filePaths.has(resolved + ext)) return resolved + ext;
  }
  // Try as directory with index
  for (const ext of exts.slice(1)) {
    if (filePaths.has(resolved + "/index" + ext)) return resolved + "/index" + ext;
  }

  return null;
}

// ---------- Public API ----------

export function buildDependencyGraph(index: RepoIndex): DependencyGraph {
  const edges: DependencyEdge[] = [];
  const dependentsOf = new Map<string, DependencyEdge[]>();
  const dependenciesOf = new Map<string, DependencyEdge[]>();
  const filePaths = new Set(index.files.map((f) => f.path));

  for (const file of index.files) {
    for (const imp of file.imports) {
      const resolvedPath = resolveImport(imp.source, file.path, filePaths);
      const isExternal = resolvedPath === null;

      const edge: DependencyEdge = {
        from: file.path,
        to: resolvedPath || imp.source,
        names: imp.names,
        isExternal,
      };
      edges.push(edge);

      // Index: file depends on target
      const deps = dependenciesOf.get(file.path) || [];
      deps.push(edge);
      dependenciesOf.set(file.path, deps);

      // Index: target is depended upon by file
      if (!isExternal) {
        const depnts = dependentsOf.get(resolvedPath!) || [];
        depnts.push(edge);
        dependentsOf.set(resolvedPath!, depnts);
      }
    }
  }

  return { edges, dependentsOf, dependenciesOf };
}

/**
 * Find all files reachable from `startPath` following import edges.
 * Useful for understanding the full dependency chain of a module.
 */
export function traceTransitiveDependencies(
  graph: DependencyGraph,
  startPath: string,
  maxDepth: number = 5
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: startPath, depth: 0 }];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;
    if (visited.has(path) || depth > maxDepth) continue;
    visited.add(path);

    const deps = graph.dependenciesOf.get(path) || [];
    for (const edge of deps) {
      if (!edge.isExternal && !visited.has(edge.to)) {
        queue.push({ path: edge.to, depth: depth + 1 });
      }
    }
  }

  visited.delete(startPath); // Don't include the start file itself
  return Array.from(visited);
}

/**
 * Find all files that depend on `targetPath` (reverse dependency trace).
 */
export function traceTransitiveDependents(
  graph: DependencyGraph,
  targetPath: string,
  maxDepth: number = 3
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: targetPath, depth: 0 }];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;
    if (visited.has(path) || depth > maxDepth) continue;
    visited.add(path);

    const depnts = graph.dependentsOf.get(path) || [];
    for (const edge of depnts) {
      if (!visited.has(edge.from)) {
        queue.push({ path: edge.from, depth: depth + 1 });
      }
    }
  }

  visited.delete(targetPath);
  return Array.from(visited);
}

/**
 * For a given symbol, trace how it's used across the codebase:
 * which files import it, and what symbols in those files use it.
 */
export function traceSymbolUsage(
  symbolName: string,
  index: RepoIndex,
  graph: DependencyGraph
): Array<{ file: string; usedBy: CodeSymbol[] }> {
  const results: Array<{ file: string; usedBy: CodeSymbol[] }> = [];

  // Find all files that import this symbol name
  for (const [filePath, edges] of graph.dependenciesOf.entries()) {
    for (const edge of edges) {
      if (edge.names.includes(symbolName)) {
        // This file imports the symbol — find which symbols in this file use it
        const fileIndex = index.fileMap.get(filePath);
        if (!fileIndex) continue;

        const usedBy = fileIndex.symbols.filter((s) =>
          s.dependencies.includes(symbolName)
        );
        results.push({ file: filePath, usedBy });
      }
    }
  }

  return results;
}
