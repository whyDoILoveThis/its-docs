import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "images";

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "No imageUrl provided" }, { status: 400 });
    }

    // Extract the storage path from a full Supabase public URL
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    const storagePath = idx !== -1 ? imageUrl.slice(idx + marker.length) : imageUrl;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error("Supabase delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete image route error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
