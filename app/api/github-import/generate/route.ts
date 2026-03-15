import { NextResponse } from "next/server";

const SYSTEM_PROMPT = {
  role: "system",
  content: `You are a documentation generator specializing in creating docs from source code. Given file contents from a repository and instructions, you create structured documentation that explains the code clearly.

You MUST respond with valid JSON only. No markdown, no explanation, no text outside the JSON.

Response format:
{
  "title": "Doc Title",
  "tagline": "Short tagline",
  "desc": "Brief description",
  "docItems": [
    { "style": "text-xl font-bold ", "text": "Section Header" },
    { "style": "btn-blue", "text": "Explanation of what this code does" },
    { "style": "code", "text": "relevant code snippet" },
    { "style": "btn-green", "text": "Key takeaways or best practices" },
    { "style": "btn-yellow", "text": "Important notes" },
    { "style": "btn-red", "text": "Warnings or gotchas" },
    { "style": "btn-orange", "text": "Additional context" }
  ]
}

STYLE GUIDE:
- "text-xl font-bold " = Section headers — use to separate logical sections
- "btn-blue" = General explanations, what code does, how it works
- "btn-green" = Best practices, key features, what works well
- "btn-yellow" = Tips, things to note, dependencies
- "btn-orange" = Alternative approaches, context, related info
- "btn-red" = Warnings, common pitfalls, security concerns
- "code" = Code snippets — include the most important/illustrative parts, not entire files

RULES:
- Write like a knowledgeable developer explaining code to a teammate
- Use a natural mix of styles for visual interest and meaning
- Include relevant code snippets but keep them focused (key functions, patterns, not entire files)
- Section headers should describe what that section covers
- Be thorough but concise — don't repeat obvious things
- Generate 8-25 items depending on complexity
- If multiple files are provided, document them cohesively — don't just list each file separately
- Focus on: what it does, how it works, key patterns, important details
- ONLY return valid JSON, nothing else`,
};

export async function POST(req: Request) {
  try {
    const { files, prompt, docTitle } = await req.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "files array is required" },
        { status: 400 }
      );
    }

    // Build file contents string
    const fileContents = files
      .filter((f: { content: string }) => f.content)
      .map(
        (f: { path: string; content: string }) =>
          `--- ${f.path} ---\n${f.content}`
      )
      .join("\n\n");

    if (!fileContents.trim()) {
      return NextResponse.json(
        { error: "No file contents to document" },
        { status: 400 }
      );
    }

    let userContent = `Create documentation for the following code files.`;
    if (docTitle) {
      userContent += `\nDoc title should be: "${docTitle}"`;
    }
    if (prompt) {
      userContent += `\nUser instructions: ${prompt}`;
    }
    userContent += `\n\nSource files:\n${fileContents}`;

    const messages = [SYSTEM_PROMPT, { role: "user", content: userContent }];

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
          temperature: 0.5,
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
        { error: "Failed to parse provider response", providerStatus: status },
        { status: 502 }
      );
    }

    if (!proxied.ok) {
      // Check for rate limit
      if (status === 429) {
        const retryAfter = data?.error?.message?.match(/try again in (\d+\.?\d*s)/)?.[1];
        return NextResponse.json(
          {
            error: "Rate limited by AI provider",
            retryAfter: retryAfter || "60s",
            rateLimited: true,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: data?.error?.message || "AI provider error", providerStatus: status },
        { status: 502 }
      );
    }

    const rawReply =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text;

    if (!rawReply) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 502 }
      );
    }

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
    console.error("Error in github-import/generate:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
