import User from '@/models/User';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    await connectDB();

    // Parse and validate the request body
    const { uid, fullName, firstName, email, projects } = await request.json();

    if (!uid || !fullName || !firstName || !email) {
      return NextResponse.json(
        { error: 'uid, fullName, firstName, and email are required' },
        { status: 400 }
      );
    }

    // Prepare the user object for saving
    const newUser = new User({
      uid,
      fullName,
      firstName,
      email,
      projects: projects || [], // Default to an empty array if no projects are provided
    });

    // Save the new user to the database
    await newUser.save();

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
