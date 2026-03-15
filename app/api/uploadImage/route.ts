import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { v4 as uuidv4 } from "uuid";

const BUCKET = "images";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);

    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${uuidv4()}-${safeName}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        cacheControl: "31536000",
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
