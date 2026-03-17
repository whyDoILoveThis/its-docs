/**
 * architectureMap.ts — Auto-generates a high-level architecture overview
 * from the repo index, dependency graph, and framework hints.
 * Categorizes code into layers (pages, components, hooks, API routes,
 * services, models, utilities) and shows data flow.
 */

import type { RepoIndex, FileIndex } from "./symbolIndexer";
import type { DependencyGraph } from "./dependencyGraph";

// ---------- Types ----------

export interface ArchLayer {
  name: string;
  description: string;
  files: ArchFile[];
}

export interface ArchFile {
  path: string;
  role: string;          // e.g. "page", "API route", "component", "hook"
  exports: string[];
  importCount: number;
  dependentCount: number; // how many files import this one
}

export interface DataFlow {
  from: string;           // layer name
  to: string;             // layer name
  description: string;
  edges: number;          // count of import edges between layers
}

export interface ArchitectureMap {
  layers: ArchLayer[];
  dataFlows: DataFlow[];
  entryPoints: string[];
  externalDeps: string[];
  summary: string;
}

// ---------- Layer Classification ----------

interface LayerRule {
  name: string;
  description: string;
  match: (path: string, file: FileIndex) => boolean;
  role: (path: string, file: FileIndex) => string;
}

const LAYER_RULES: LayerRule[] = [
  {
    name: "Pages & Layouts",
    description: "Next.js pages, layouts, and loading states",
    match: (p) =>
      /^app\/.*\/(page|layout|loading|error|not-found)\.(ts|tsx|js|jsx)$/.test(p) ||
      /^app\/(page|layout|loading|error|not-found)\.(ts|tsx|js|jsx)$/.test(p) ||
      /^pages\//.test(p),
    role: (p) => {
      if (p.includes("layout.")) return "layout";
      if (p.includes("loading.")) return "loading";
      if (p.includes("error.")) return "error boundary";
      if (p.includes("not-found.")) return "not-found page";
      return "page";
    },
  },
  {
    name: "API Routes",
    description: "Server-side API endpoints",
    match: (p) => /^app\/api\//.test(p) || /^pages\/api\//.test(p),
    role: (_p, file) => {
      const methods = file.symbols
        .filter((s) => s.kind === "route_handler")
        .map((s) => s.name);
      return methods.length > 0
        ? `route handler (${methods.join(", ")})`
        : "API route";
    },
  },
  {
    name: "Components",
    description: "React UI components",
    match: (p, file) =>
      /^components\//.test(p) ||
      file.symbols.some((s) => s.kind === "component"),
    role: (_p, file) => {
      if (file.framework.isClientComponent) return "client component";
      if (file.framework.isServerComponent) return "server component";
      return "component";
    },
  },
  {
    name: "Hooks",
    description: "Custom React hooks and state management",
    match: (p, file) =>
      /^hooks\//.test(p) || file.symbols.some((s) => s.kind === "hook"),
    role: (_p, file) => {
      const hooks = file.symbols.filter((s) => s.kind === "hook");
      return hooks.length > 0
        ? `hook (${hooks.map((h) => h.name).join(", ")})`
        : "hook";
    },
  },
  {
    name: "Library & Utilities",
    description: "Shared libraries, configurations, and utility functions",
    match: (p) => /^lib\//.test(p) || /^utils?\//.test(p) || /^config\//.test(p),
    role: (p) => {
      if (p.includes("Config") || p.includes("config")) return "configuration";
      if (p.includes("util")) return "utility";
      return "library module";
    },
  },
  {
    name: "Models & Types",
    description: "Data models, schemas, and type definitions",
    match: (p) =>
      /^models\//.test(p) || /^types\//.test(p) || /^schemas?\//.test(p),
    role: (p) => {
      if (/^models\//.test(p)) return "data model";
      return "type definitions";
    },
  },
  {
    name: "Middleware",
    description: "Request middleware and interceptors",
    match: (p, file) =>
      p === "middleware.ts" || p === "middleware.js" || file.framework.hasMiddleware,
    role: () => "middleware",
  },
  {
    name: "Styles",
    description: "CSS, styling, and theme files",
    match: (p) =>
      /\.(css|scss|sass|less)$/.test(p) || /^styles\//.test(p) || p.includes("theme"),
    role: (p) => {
      if (p.includes("global")) return "global styles";
      if (p.includes("theme")) return "theme";
      return "stylesheet";
    },
  },
  {
    name: "Other",
    description: "Configuration files, assets, and other resources",
    match: () => true, // catch-all
    role: (p) => {
      if (/\.(json|yaml|yml)$/.test(p)) return "configuration";
      if (/\.(md|txt)$/.test(p)) return "documentation";
      return "resource";
    },
  },
];

// ---------- Public API ----------

export function generateArchitectureMap(
  repoIndex: RepoIndex,
  depGraph: DependencyGraph,
): ArchitectureMap {
  // Phase 1: Classify files into layers
  const layerMap = new Map<string, ArchFile[]>();
  const fileLayers = new Map<string, string>(); // file → layer name

  for (const file of repoIndex.files) {
    const rule = LAYER_RULES.find((r) => r.match(file.path, file))!;
    const layer = rule.name;

    const deps = depGraph.dependenciesOf.get(file.path) || [];
    const dependents = depGraph.dependentsOf.get(file.path) || [];

    const archFile: ArchFile = {
      path: file.path,
      role: rule.role(file.path, file),
      exports: file.exports,
      importCount: deps.filter((e) => !e.isExternal).length,
      dependentCount: dependents.length,
    };

    const existing = layerMap.get(layer) || [];
    existing.push(archFile);
    layerMap.set(layer, existing);
    fileLayers.set(file.path, layer);
  }

  // Build layers array (only include non-empty layers)
  const layers: ArchLayer[] = [];
  for (const rule of LAYER_RULES) {
    const files = layerMap.get(rule.name);
    if (files && files.length > 0) {
      layers.push({
        name: rule.name,
        description: rule.description,
        files: files.sort((a, b) => b.dependentCount - a.dependentCount),
      });
    }
  }

  // Phase 2: Compute data flows between layers
  const flowCounts = new Map<string, number>();
  for (const edge of depGraph.edges) {
    if (edge.isExternal) continue;
    const fromLayer = fileLayers.get(edge.from);
    const toLayer = fileLayers.get(edge.to);
    if (!fromLayer || !toLayer || fromLayer === toLayer) continue;
    const key = `${fromLayer}→${toLayer}`;
    flowCounts.set(key, (flowCounts.get(key) || 0) + 1);
  }

  const dataFlows: DataFlow[] = [];
  for (const [key, count] of flowCounts.entries()) {
    const [from, to] = key.split("→");
    dataFlows.push({
      from,
      to,
      description: `${from} imports from ${to}`,
      edges: count,
    });
  }
  dataFlows.sort((a, b) => b.edges - a.edges);

  // Phase 3: Find entry points (files with no dependents, or pages/routes)
  const entryPoints: string[] = [];
  for (const file of repoIndex.files) {
    const dependents = depGraph.dependentsOf.get(file.path) || [];
    const layer = fileLayers.get(file.path) || "";
    if (
      layer === "Pages & Layouts" ||
      layer === "API Routes" ||
      layer === "Middleware" ||
      dependents.length === 0
    ) {
      entryPoints.push(file.path);
    }
  }

  // Phase 4: Collect external dependencies
  const externalDeps = new Set<string>();
  for (const edge of depGraph.edges) {
    if (edge.isExternal) {
      externalDeps.add(edge.to);
    }
  }

  // Phase 5: Build summary
  const summary = buildSummary(layers, dataFlows, entryPoints, externalDeps);

  return {
    layers,
    dataFlows,
    entryPoints,
    externalDeps: Array.from(externalDeps).sort(),
    summary,
  };
}

/**
 * Format the architecture map as a compact text representation
 * suitable for inclusion in AI prompts.
 */
export function formatArchitectureForAI(map: ArchitectureMap): string {
  const lines: string[] = ["## Architecture Overview\n"];

  for (const layer of map.layers) {
    lines.push(`### ${layer.name}`);
    lines.push(`${layer.description}`);
    for (const f of layer.files.slice(0, 15)) {
      const deps = f.dependentCount > 0 ? ` (used by ${f.dependentCount} files)` : "";
      lines.push(`  - ${f.path} [${f.role}]${deps}`);
    }
    if (layer.files.length > 15) {
      lines.push(`  - ... and ${layer.files.length - 15} more`);
    }
    lines.push("");
  }

  if (map.dataFlows.length > 0) {
    lines.push("### Data Flow");
    for (const flow of map.dataFlows.slice(0, 10)) {
      lines.push(`  ${flow.from} → ${flow.to} (${flow.edges} connections)`);
    }
    lines.push("");
  }

  if (map.externalDeps.length > 0) {
    lines.push(`### External Dependencies`);
    lines.push(`  ${map.externalDeps.slice(0, 20).join(", ")}`);
    if (map.externalDeps.length > 20) {
      lines.push(`  ... and ${map.externalDeps.length - 20} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------- Helpers ----------

function buildSummary(
  layers: ArchLayer[],
  dataFlows: DataFlow[],
  entryPoints: string[],
  externalDeps: Set<string>,
): string {
  const parts: string[] = [];

  const fileCounts = layers.map((l) => `${l.files.length} ${l.name.toLowerCase()}`);
  parts.push(`Repository contains ${fileCounts.join(", ")}.`);

  const pageCount = layers.find((l) => l.name === "Pages & Layouts")?.files.length || 0;
  const apiCount = layers.find((l) => l.name === "API Routes")?.files.length || 0;
  if (pageCount > 0) parts.push(`${pageCount} pages/layouts.`);
  if (apiCount > 0) parts.push(`${apiCount} API routes.`);

  parts.push(`${entryPoints.length} entry points.`);
  parts.push(`${externalDeps.size} external dependencies.`);

  if (dataFlows.length > 0) {
    const topFlow = dataFlows[0];
    parts.push(
      `Strongest data flow: ${topFlow.from} → ${topFlow.to} (${topFlow.edges} connections).`,
    );
  }

  return parts.join(" ");
}
