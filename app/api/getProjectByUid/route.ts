import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Project from "@/models/Project";

export async function GET(request: Request) {
  try {
    console.log("Connecting to MongoDB...");
    await dbConnect();
    console.log("Connected to MongoDB.");

    const { searchParams } = new URL(request.url);
    const projUid = searchParams.get("projUid");

    if (!projUid) {
      return NextResponse.json({ error: "projUid is required ❌" }, { status: 400 });
    }

    console.log(`Fetching projects for projUid: ${projUid}`);
    const projects = await Project.find({ uid: projUid });

    
    if (!projects[0]) {
        return NextResponse.json({ message: "No project found for this uid ✅" });
    }
    console.log(projects[0]);

    return NextResponse.json({ project: projects[0] });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Internal Server Error ❌" }, { status: 500 });
  }
}
