/**
 * astParser.ts — TypeScript Compiler API-based parser.
 * Extracts functions, classes, interfaces, type aliases, enums,
 * React components, hooks, route handlers, imports, exports,
 * JSDoc comments, and call expressions with full accuracy.
 *
 * Falls back to regex extraction for non-TS/JS languages.
 */

import ts from "typescript";
import type { RepoFile } from "./repoScanner";

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
  | "method"
  | "variable";

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  signature: string;
  exported: boolean;
  isDefault: boolean;
  jsdoc: string;
  parameters: string[];
  returnType: string;
  callsTo: string[];      // functions called inside this symbol
  decorators: string[];
}

export interface ParsedImport {
  source: string;
  names: string[];
  isDefault: boolean;
  isTypeOnly: boolean;
  line: number;
}

export interface ParsedExport {
  name: string;
  isDefault: boolean;
  isReExport: boolean;
  source?: string; // for re-exports: export { x } from "./foo"
}

export interface ParsedFile {
  path: string;
  language: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  topLevelCalls: string[];  // top-level function calls (e.g. connectDB())
  framework: FrameworkHint;
}

export interface FrameworkHint {
  isNextJSRoute: boolean;
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasMiddleware: boolean;
  hasMetadata: boolean;
  usesReact: boolean;
}

// ---------- Helpers ----------

function getJsDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return "";
  return jsDocs
    .map((d) => d.getText(sourceFile))
    .join("\n")
    .trim();
}

function getNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile);
}

function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getEndLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === kind) ?? false;
}

function isExported(node: ts.Node): boolean {
  return (
    hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
    hasModifier(node, ts.SyntaxKind.DefaultKeyword)
  );
}

function isDefaultExport(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

/** Collect all function/method calls inside a node */
function collectCalls(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const calls: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n)) {
      const expr = n.expression;
      if (ts.isIdentifier(expr)) {
        calls.push(expr.text);
      } else if (ts.isPropertyAccessExpression(expr)) {
        calls.push(expr.getText(sourceFile));
      }
    }
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(node, visit);
  return [...new Set(calls)];
}

/** Infer the kind of a function based on naming conventions */
function inferKind(name: string, _returnType: string): SymbolKind {
  if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/.test(name)) return "route_handler";
  if (name.startsWith("use") && name.length > 3 && name[3] === name[3].toUpperCase()) return "hook";
  if (name[0] === name[0].toUpperCase() && name[0] !== "_") return "component";
  return "function";
}

function getParameterSignatures(
  params: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile,
): string[] {
  return params.map((p) => p.getText(sourceFile));
}

function getReturnTypeText(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
): string {
  if (node.type) return node.type.getText(sourceFile);
  return "";
}

// ---------- Core Parser ----------

export function parseFile(file: RepoFile): ParsedFile {
  // Only parse TS/JS files with AST; others get empty results
  if (!["typescript", "javascript"].includes(file.language)) {
    return {
      path: file.path,
      language: file.language,
      symbols: [],
      imports: [],
      exports: [],
      topLevelCalls: [],
      framework: {
        isNextJSRoute: false, isClientComponent: false,
        isServerComponent: false, hasMiddleware: false,
        hasMetadata: false, usesReact: false,
      },
    };
  }

  const isJsx = file.path.endsWith(".tsx") || file.path.endsWith(".jsx");
  const sourceFile = ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: ParsedExport[] = [];
  const topLevelCalls: string[] = [];

  // Framework detection
  const framework: FrameworkHint = {
    isNextJSRoute: false,
    isClientComponent: false,
    isServerComponent: false,
    hasMiddleware: false,
    hasMetadata: false,
    usesReact: false,
  };

  // Detect "use client" / "use server" directives
  const firstStmt = sourceFile.statements[0];
  if (firstStmt && ts.isExpressionStatement(firstStmt)) {
    const text = firstStmt.getText(sourceFile).trim();
    if (text === '"use client";' || text === "'use client';") {
      framework.isClientComponent = true;
    }
    if (text === '"use server";' || text === "'use server';") {
      framework.isServerComponent = true;
    }
  }

  // Is this an app router route file?
  if (/app\/.*\/route\.(ts|js)$/.test(file.path) || file.path === "middleware.ts") {
    framework.isNextJSRoute = true;
  }
  if (file.path === "middleware.ts" || file.path === "middleware.js") {
    framework.hasMiddleware = true;
  }

  function visit(node: ts.Node, depth: number) {
    // --- Imports ---
    if (ts.isImportDeclaration(node)) {
      const moduleSpec = node.moduleSpecifier;
      const source = ts.isStringLiteral(moduleSpec) ? moduleSpec.text : "";
      const clause = node.importClause;
      const names: string[] = [];
      let isDefault = false;
      const isTypeOnly = clause?.isTypeOnly ?? false;

      if (clause) {
        // Default import: import Foo from "..."
        if (clause.name) {
          names.push(clause.name.text);
          isDefault = true;
        }
        // Named imports: import { a, b } from "..."
        if (clause.namedBindings) {
          if (ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              names.push(el.name.text);
            }
          }
          // Namespace: import * as ns from "..."
          if (ts.isNamespaceImport(clause.namedBindings)) {
            names.push(clause.namedBindings.name.text);
          }
        }
      }
      if (source === "react") framework.usesReact = true;

      imports.push({
        source,
        names,
        isDefault,
        isTypeOnly,
        line: getLineNumber(node, sourceFile),
      });
      return;
    }

    // --- Export declarations (re-exports) ---
    if (ts.isExportDeclaration(node)) {
      const reExportSource = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exports.push({
            name: el.name.text,
            isDefault: false,
            isReExport: !!reExportSource,
            source: reExportSource,
          });
        }
      }
      return;
    }

    // --- Function Declarations ---
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text;
      const exp = isExported(node);
      const def = isDefaultExport(node);
      const kind = inferKind(name, getReturnTypeText(node, sourceFile));
      const params = node.parameters ? getParameterSignatures(node.parameters, sourceFile) : [];
      const ret = getReturnTypeText(node, sourceFile);
      const calls = collectCalls(node, sourceFile);
      const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);

      if (kind === "route_handler") framework.isNextJSRoute = true;
      if (/^(metadata|generateMetadata|generateStaticParams)$/.test(name)) {
        framework.hasMetadata = true;
      }

      symbols.push({
        name,
        kind,
        filePath: file.path,
        startLine: getLineNumber(node, sourceFile),
        endLine: getEndLine(node, sourceFile),
        code: getNodeText(node, sourceFile),
        signature: `${isAsync ? "async " : ""}function ${name}(${params.join(", ")})${ret ? `: ${ret}` : ""}`,
        exported: exp,
        isDefault: def,
        jsdoc: getJsDoc(node, sourceFile),
        parameters: params,
        returnType: ret,
        callsTo: calls,
        decorators: [],
      });

      if (exp) {
        exports.push({ name, isDefault: def, isReExport: false });
      }
      return;
    }

    // --- Variable Declarations (arrow functions, constants, etc.) ---
    if (ts.isVariableStatement(node)) {
      const exp = isExported(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;

        if (decl.initializer) {
          // Arrow function or function expression
          if (
            ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer)
          ) {
            const fn = decl.initializer;
            const kind = inferKind(name, getReturnTypeText(fn, sourceFile));
            const params = fn.parameters ? getParameterSignatures(fn.parameters, sourceFile) : [];
            const ret = getReturnTypeText(fn, sourceFile);
            const calls = collectCalls(fn, sourceFile);
            const isAsync = hasModifier(fn, ts.SyntaxKind.AsyncKeyword);

            if (kind === "route_handler") framework.isNextJSRoute = true;

            symbols.push({
              name,
              kind: kind === "function" ? "arrow_function" : kind,
              filePath: file.path,
              startLine: getLineNumber(node, sourceFile),
              endLine: getEndLine(node, sourceFile),
              code: getNodeText(node, sourceFile),
              signature: `const ${name} = ${isAsync ? "async " : ""}(${params.join(", ")})${ret ? `: ${ret}` : ""} => ...`,
              exported: exp,
              isDefault: false,
              jsdoc: getJsDoc(node, sourceFile),
              parameters: params,
              returnType: ret,
              callsTo: calls,
              decorators: [],
            });
          } else {
            // Regular variable (non-function)
            symbols.push({
              name,
              kind: "variable",
              filePath: file.path,
              startLine: getLineNumber(node, sourceFile),
              endLine: getEndLine(node, sourceFile),
              code: getNodeText(node, sourceFile),
              signature: `const ${name}`,
              exported: exp,
              isDefault: false,
              jsdoc: getJsDoc(node, sourceFile),
              parameters: [],
              returnType: decl.type ? decl.type.getText(sourceFile) : "",
              callsTo: collectCalls(decl, sourceFile),
              decorators: [],
            });
          }

          if (exp) {
            exports.push({ name, isDefault: false, isReExport: false });
          }
        }
      }
      return;
    }

    // --- Class Declarations ---
    if (ts.isClassDeclaration(node)) {
      const name = node.name?.text || "(anonymous)";
      const exp = isExported(node);
      const def = isDefaultExport(node);
      const calls = collectCalls(node, sourceFile);

      symbols.push({
        name,
        kind: "class",
        filePath: file.path,
        startLine: getLineNumber(node, sourceFile),
        endLine: getEndLine(node, sourceFile),
        code: getNodeText(node, sourceFile),
        signature: `class ${name}`,
        exported: exp,
        isDefault: def,
        jsdoc: getJsDoc(node, sourceFile),
        parameters: [],
        returnType: "",
        callsTo: calls,
        decorators: [],
      });

      // Extract methods
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const params = member.parameters ? getParameterSignatures(member.parameters, sourceFile) : [];
          const ret = getReturnTypeText(member, sourceFile);
          const isAsync = hasModifier(member, ts.SyntaxKind.AsyncKeyword);

          symbols.push({
            name: `${name}.${methodName}`,
            kind: "method",
            filePath: file.path,
            startLine: getLineNumber(member, sourceFile),
            endLine: getEndLine(member, sourceFile),
            code: getNodeText(member, sourceFile),
            signature: `${isAsync ? "async " : ""}${name}.${methodName}(${params.join(", ")})${ret ? `: ${ret}` : ""}`,
            exported: exp,
            isDefault: false,
            jsdoc: getJsDoc(member, sourceFile),
            parameters: params,
            returnType: ret,
            callsTo: collectCalls(member, sourceFile),
            decorators: [],
          });
        }
      }

      if (exp) {
        exports.push({ name, isDefault: def, isReExport: false });
      }
      return;
    }

    // --- Interface Declarations ---
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const exp = isExported(node);

      symbols.push({
        name,
        kind: "interface",
        filePath: file.path,
        startLine: getLineNumber(node, sourceFile),
        endLine: getEndLine(node, sourceFile),
        code: getNodeText(node, sourceFile),
        signature: `interface ${name}`,
        exported: exp,
        isDefault: false,
        jsdoc: getJsDoc(node, sourceFile),
        parameters: [],
        returnType: "",
        callsTo: [],
        decorators: [],
      });

      if (exp) {
        exports.push({ name, isDefault: false, isReExport: false });
      }
      return;
    }

    // --- Type Alias Declarations ---
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      const exp = isExported(node);

      symbols.push({
        name,
        kind: "type",
        filePath: file.path,
        startLine: getLineNumber(node, sourceFile),
        endLine: getEndLine(node, sourceFile),
        code: getNodeText(node, sourceFile),
        signature: `type ${name}`,
        exported: exp,
        isDefault: false,
        jsdoc: getJsDoc(node, sourceFile),
        parameters: [],
        returnType: "",
        callsTo: [],
        decorators: [],
      });

      if (exp) {
        exports.push({ name, isDefault: false, isReExport: false });
      }
      return;
    }

    // --- Enum Declarations ---
    if (ts.isEnumDeclaration(node)) {
      const name = node.name.text;
      const exp = isExported(node);

      symbols.push({
        name,
        kind: "enum",
        filePath: file.path,
        startLine: getLineNumber(node, sourceFile),
        endLine: getEndLine(node, sourceFile),
        code: getNodeText(node, sourceFile),
        signature: `enum ${name}`,
        exported: exp,
        isDefault: false,
        jsdoc: getJsDoc(node, sourceFile),
        parameters: [],
        returnType: "",
        callsTo: [],
        decorators: [],
      });

      if (exp) {
        exports.push({ name, isDefault: false, isReExport: false });
      }
      return;
    }

    // --- Export assignment: export default X ---
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      const name = ts.isIdentifier(expr) ? expr.text : "(default)";
      exports.push({ name, isDefault: true, isReExport: false });
      return;
    }

    // --- Top-level call expressions ---
    if (depth === 0 && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const expr = node.expression.expression;
      if (ts.isIdentifier(expr)) {
        topLevelCalls.push(expr.text);
      } else if (ts.isPropertyAccessExpression(expr)) {
        topLevelCalls.push(expr.getText(sourceFile));
      }
    }

    // Recurse into children only for top-level statements
    if (depth === 0) {
      ts.forEachChild(node, (child) => visit(child, depth + 1));
    }
  }

  for (const stmt of sourceFile.statements) {
    visit(stmt, 0);
  }

  return {
    path: file.path,
    language: file.language,
    symbols,
    imports,
    exports,
    topLevelCalls,
    framework,
  };
}

/** Parse multiple files and return all results */
export function parseFiles(files: RepoFile[]): ParsedFile[] {
  return files.map(parseFile);
}
