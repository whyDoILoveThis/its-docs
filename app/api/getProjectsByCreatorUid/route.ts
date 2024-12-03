import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Project from "@/models/Project";

export async function GET(request: Request) {
  try {
    console.log("Connecting to MongoDB...");
    await dbConnect();
    console.log("Connected to MongoDB.");

    const { searchParams } = new URL(request.url);
    const creatorUid = searchParams.get("creatorUid");

    if (!creatorUid) {
      return NextResponse.json({ error: "creatorUid is required ❌" }, { status: 400 });
    }

    console.log(`Fetching projects for creatorUid: ${creatorUid}`);
    const projects = await Project.find({ creatorUid });

    if (!projects.length) {
      return NextResponse.json({ message: "No projects found for this creator ✅" });
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Internal Server Error ❌" }, { status: 500 });
  }
}
