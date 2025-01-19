import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export async function PUT(request: Request) {
  try {
    console.log("Connecting to MongoDB...");
    await dbConnect();
    console.log("Connected to MongoDB.");

    const { field, value, userUid } = await request.json();

    if (!field || !value || !userUid) {
      return NextResponse.json(
        { error: "Field, value, and userUid are required ❌" },
        { status: 400 }
      );
    }

    const update = { [field]: value };
    const updatedUser = await User.findOneAndUpdate(
      { uid: userUid },
      { $set: update },
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json(
        { error: "User not found ❌" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Profile updated successfully ✅",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ An error occurred:", error);
    return NextResponse.json(
      { error: "Internal Server Error ❌" },
      { status: 500 }
    );
  }
}
