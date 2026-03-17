/**
 * Robust JSON extraction from LLM responses.
 * Handles markdown fences, leading/trailing text, trailing commas,
 * and other common LLM output quirks.
 */

/**
 * Extract and parse JSON from a raw LLM response string.
 * Tries multiple strategies in order:
 * 1. Direct JSON.parse
 * 2. Strip markdown code fences
 * 3. Find the first { ... } or [ ... ] block
 * 4. Fix trailing commas and retry
 */
export function extractJSON(raw: string): { parsed: unknown; error?: string } {
  const trimmed = raw.trim();

  // 1. Direct parse (best case)
  try {
    return { parsed: JSON.parse(trimmed) };
  } catch {
    // continue to next strategy
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = trimmed.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      return { parsed: JSON.parse(inner) };
    } catch {
      // Try fixing the fenced content
      const fixed = fixCommonIssues(inner);
      try {
        return { parsed: JSON.parse(fixed) };
      } catch {
        // continue
      }
    }
  }

  // 3. Find outermost JSON object or array in the string
  const jsonBlock = extractOutermostJSON(trimmed);
  if (jsonBlock) {
    try {
      return { parsed: JSON.parse(jsonBlock) };
    } catch {
      const fixed = fixCommonIssues(jsonBlock);
      try {
        return { parsed: JSON.parse(fixed) };
      } catch {
        // continue
      }
    }
  }

  // 4. Last resort: fix the whole trimmed string
  const fixed = fixCommonIssues(trimmed);
  try {
    return { parsed: JSON.parse(fixed) };
  } catch {
    return {
      parsed: null,
      error: `Could not extract valid JSON from AI response (${trimmed.length} chars). Starts with: ${trimmed.slice(0, 120)}`,
    };
  }
}

/**
 * Find the outermost balanced { ... } or [ ... ] in a string.
 */
function extractOutermostJSON(str: string): string | null {
  // Find the first { or [
  let startChar: "{" | "[" | null = null;
  let endChar: "}" | "]" | null = null;
  let startIdx = -1;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "{") {
      startChar = "{";
      endChar = "}";
      startIdx = i;
      break;
    }
    if (str[i] === "[") {
      startChar = "[";
      endChar = "]";
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1 || !startChar || !endChar) return null;

  // Walk forward counting brackets, respecting strings
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === startChar) depth++;
    if (ch === endChar) depth--;

    if (depth === 0) {
      return str.slice(startIdx, i + 1);
    }
  }

  // Unbalanced — return from start to end as fallback
  return str.slice(startIdx);
}

/**
 * Fix common LLM JSON issues: trailing commas, single-line // comments.
 */
function fixCommonIssues(str: string): string {
  let result = str;

  // Remove single-line comments (// ...) outside of strings
  // Process line by line to be safe
  result = result
    .split("\n")
    .map((line) => {
      // Don't strip if inside a JSON string value — simple heuristic:
      // count unescaped quotes before the //
      const commentIdx = findCommentOutsideString(line);
      if (commentIdx !== -1) {
        return line.slice(0, commentIdx).trimEnd();
      }
      return line;
    })
    .join("\n");

  // Remove trailing commas before } or ]
  result = result.replace(/,\s*([\]}])/g, "$1");

  return result;
}

/**
 * Find index of // comment that's outside a JSON string.
 * Returns -1 if no comment found outside strings.
 */
function findCommentOutsideString(line: string): number {
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString && ch === "/" && line[i + 1] === "/") {
      return i;
    }
  }

  return -1;
}
