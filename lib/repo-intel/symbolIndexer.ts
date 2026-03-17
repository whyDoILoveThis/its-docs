/**
 * symbolIndexer.ts — Builds a searchable symbol index from parsed AST data.
 * Uses the TypeScript Compiler API via astParser.ts for accurate extraction.
 * Provides backward-compatible types consumed by dependencyGraph & contextBuilder.
 */

import type { RepoFile } from "./repoScanner";
import { parseFile } from "./astParser";
import type { ParsedFile, ParsedSymbol, FrameworkHint } from "./astParser";

// ---------- Types ----------

export type SymbolKind =
  | "function"
  | "arrow_function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "component"
  | "hook"
  | "route_handler"
  | "variable"
  | "method";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  exported: boolean;
  isDefault: boolean;
  signature: string;
  dependencies: string[]; // imported names used inside this symbol
  jsdoc: string;
  callsTo: string[];      // function/method calls inside this symbol
  parameters: string[];
  returnType: string;
}

export interface FileIndex {
  path: string;
  language: string;
  symbols: CodeSymbol[];
  imports: ImportDecl[];
  exports: string[];
  framework: FrameworkHint;
}

export interface ImportDecl {
  source: string;
  names: string[];
  isDefault: boolean;
  isTypeOnly: boolean;
  line: number;
}

export interface RepoIndex {
  files: FileIndex[];
  allSymbols: CodeSymbol[];
  symbolMap: Map<string, CodeSymbol[]>;
  fileMap: Map<string, FileIndex>;
  callGraph: Map<string, string[]>; // symbol name → names it calls
  indexedAt: number;
}

// ---------- Internal: Convert AST data to index types ----------

function convertSymbol(ps: ParsedSymbol, allImportedNames: Set<string>): CodeSymbol {
  // Compute dependencies: which imported names appear in this symbol's callsTo list or code
  const deps: string[] = [];
  for (const name of allImportedNames) {
    // Check callsTo first (most accurate from AST)
    if (ps.callsTo.some((c) => c === name || c.startsWith(name + "."))) {
      deps.push(name);
      continue;
    }
    // Fallback: check if import name appears as a word in the code
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(ps.code)) {
      deps.push(name);
    }
  }

  return {
    name: ps.name,
    kind: ps.kind,
    filePath: ps.filePath,
    startLine: ps.startLine,
    endLine: ps.endLine,
    code: ps.code,
    exported: ps.exported,
    isDefault: ps.isDefault,
    signature: ps.signature,
    dependencies: deps,
    jsdoc: ps.jsdoc,
    callsTo: ps.callsTo,
    parameters: ps.parameters,
    returnType: ps.returnType,
  };
}

// ---------- Public API ----------

export function indexFile(file: RepoFile): FileIndex {
  const parsed: ParsedFile = parseFile(file);
  const allImportedNames = new Set(parsed.imports.flatMap((i) => i.names));

  return {
    path: parsed.path,
    language: parsed.language,
    symbols: parsed.symbols.map((s) => convertSymbol(s, allImportedNames)),
    imports: parsed.imports.map((i) => ({
      source: i.source,
      names: i.names,
      isDefault: i.isDefault,
      isTypeOnly: i.isTypeOnly,
      line: i.line,
    })),
    exports: parsed.exports.map((e) => e.name),
    framework: parsed.framework,
  };
}

export function buildIndex(files: RepoFile[]): RepoIndex {
  const fileIndices: FileIndex[] = [];
  const allSymbols: CodeSymbol[] = [];
  const symbolMap = new Map<string, CodeSymbol[]>();
  const fileMap = new Map<string, FileIndex>();
  const callGraph = new Map<string, string[]>();

  for (const file of files) {
    const idx = indexFile(file);
    fileIndices.push(idx);
    fileMap.set(file.path, idx);

    for (const sym of idx.symbols) {
      allSymbols.push(sym);

      const existing = symbolMap.get(sym.name) || [];
      existing.push(sym);
      symbolMap.set(sym.name, existing);

      if (sym.callsTo.length > 0) {
        callGraph.set(sym.name, sym.callsTo);
      }
    }
  }

  return {
    files: fileIndices,
    allSymbols,
    symbolMap,
    fileMap,
    callGraph,
    indexedAt: Date.now(),
  };
}
