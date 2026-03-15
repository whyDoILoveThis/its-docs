import { NextResponse } from "next/server";

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

MODE "modify" - Return the FULL modified docItems array. CRITICAL: You MUST include ALL existing items in your response. Only change the specific items the user asks about. Every item that the user did NOT ask you to change must be returned EXACTLY as-is, unchanged, in the same position. Do NOT remove, skip, or summarize any items. The output array should have at LEAST as many items as the input unless the user explicitly asks to remove something.
{
  "docItems": [
    { "style": "text-xl font-bold ", "text": "Existing Section Unchanged" },
    { "style": "btn-blue", "text": "This item was modified per user request" },
    { "style": "btn-green", "text": "This existing item stays exactly the same" }
  ]
}

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
      userContent += `\n\nExisting doc items:\n${JSON.stringify(existingDocItems, null, 2)}`;
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

    // Extract JSON from the response (handle markdown code fences)
    let jsonStr = rawReply.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw: rawReply },
        { status: 502 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("Error in /api/its-ai-docs:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
