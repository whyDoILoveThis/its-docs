import { NextResponse } from "next/server";
import { extractJSON } from "@/lib/extractJSON";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are a documentation generator. You create structured documentation content that is well-organized with sections, color-coded blocks, and code examples.

You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON.

The JSON structure depends on the "mode" field in the user request:

MODE "generate" - Generate a full new doc:
{
  "title": "Doc Title",
  "tagline": "Short tagline",
  "desc": "Brief description",
  "docItems": [
    { "style": "text-xl font-bold ", "text": "Section Header" },
    { "style": "btn-blue", "text": "Informational content" },
    { "style": "code", "text": "const example = true;" },
    { "style": "btn-green", "text": "Success/positive notes" },
    { "style": "btn-yellow", "text": "Warnings or tips" },
    { "style": "btn-red", "text": "Important warnings" },
    { "style": "btn-orange", "text": "Secondary notes" }
  ]
}

MODE "add" - Generate only new docItems to append to an existing doc:
{
  "docItems": [
    { "style": "text-xl font-bold ", "text": "New Section" },
    { "style": "btn-blue", "text": "New content" }
  ]
}

MODE "modify" - Return ONLY the changes needed as an operations array. Do NOT return unchanged items.

Existing items are listed with 0-based index numbers like [0], [1], etc.
Return a JSON object with an "operations" array. Each operation is one of:
- Replace an item: { "type": "replace", "index": <number>, "item": { "style": "...", "text": "..." } }
- Insert new items after a position: { "type": "insert_after", "index": <number>, "items": [{ "style": "...", "text": "..." }] }
  Use "index": -1 to insert at the very beginning of the doc.
- Delete an item: { "type": "delete", "index": <number> }

Example:
{
  "operations": [
    { "type": "replace", "index": 2, "item": { "style": "btn-blue", "text": "Updated text" } },
    { "type": "insert_after", "index": 3, "items": [{ "style": "code", "text": "new code here" }] },
    { "type": "delete", "index": 7 }
  ]
}

CRITICAL: Indices are 0-based and refer to the CURRENT item positions as listed. Only include operations for items you are actually changing, inserting, or deleting. Everything not mentioned stays exactly where it is. To insert at the very end, use the index of the last existing item.

STYLE GUIDE - use these style values:
- "text-xl font-bold " = Section headers (use to break up content into logical sections)
- "btn-blue" = General info, explanations, descriptions
- "btn-green" = Positive notes, success info, best practices, solutions
- "btn-yellow" = Tips, warnings, things to note
- "btn-orange" = Secondary info, alternatives, side notes
- "btn-red" = Critical warnings, errors, things to avoid
- "code" = Code blocks, terminal commands, file contents

RULES:
- Make docs look like they were carefully written by a person
- Use a good mix of styles to make docs visually interesting and color-coded
- Use section headers to organize content logically
- Include code blocks when relevant
- Keep individual item text concise but informative
- Use color coding meaningfully (green for positives, red for warnings, etc.)
- Generate between 5-20 items depending on the complexity of the topic
- ONLY return valid JSON, nothing else`,
};

export async function POST(req: Request) {
  try {
    const { prompt, mode, existingDocItems } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required and must be a string" },
        { status: 400 }
      );
    }

    if (!mode || !["generate", "add", "modify"].includes(mode)) {
      return NextResponse.json(
        { error: "mode must be 'generate', 'add', or 'modify'" },
        { status: 400 }
      );
    }

    let userContent = `Mode: ${mode}\nPrompt: ${prompt}`;

    if ((mode === "add" || mode === "modify") && existingDocItems) {
      const indexed = existingDocItems
        .map(
          (item: { style: string; text: string }, i: number) =>
            `[${i}] (${item.style}) ${item.text}`
        )
        .join("\n");
      userContent += `\n\nExisting doc items:\n${indexed}`;
    }

    const messages = [
      SYSTEM_PROMPT,
      { role: "user", content: userContent },
    ];

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
          temperature: 0.7,
        }),
      }
    );

    const status = proxied.status;
    const text = await proxied.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse provider JSON", providerStatus: status },
        { status: 502 }
      );
    }

    if (!proxied.ok) {
      return NextResponse.json(
        { error: "Provider error", providerStatus: status, providerBody: data },
        { status: 502 }
      );
    }

    const rawReply =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text ??
      data.output?.[0]?.content?.[0]?.text;

    if (!rawReply) {
      return NextResponse.json(
        { error: "No response from AI provider" },
        { status: 502 }
      );
    }

    // Extract JSON from AI response (handles fences, trailing commas, comments, etc.)
    const { parsed, error: jsonError } = extractJSON(rawReply);
    if (jsonError || parsed === null) {
      return NextResponse.json(
        { error: "AI returned invalid JSON", detail: jsonError, raw: rawReply },
        { status: 502 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("Error in /api/its-ai-docs:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
