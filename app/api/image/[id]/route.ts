// app/api/image/[id]/route.ts
// Legacy proxy – kept so old Mega node-IDs stored in the DB still resolve.
// New images are served directly from Supabase public URLs and never hit this route.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseConfig";

const BUCKET = "images";

export async function GET(
  _req: Request,
  context: { params: { id: string } }
) {
  try {
    const id = (await context.params).id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // If the id looks like a Supabase storage path (contains a dot for file extension)
    // try to redirect to the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(id);

    if (urlData?.publicUrl) {
      return NextResponse.redirect(urlData.publicUrl, 301);
    }

    return NextResponse.json({ error: "File not found" }, { status: 404 });
  } catch (err: unknown) {
    console.error("Image proxy error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
