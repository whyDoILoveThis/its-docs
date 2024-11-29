// /app/api/checkUser/route.ts
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { NextResponse } from 'next/server';


export async function POST(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected to MongoDB.');

    const { uid } = await request.json();
    console.log(`Received uid: ${uid}`);

    if (!uid) {
      console.log('User ID is missing.');
      return NextResponse.json({ error: 'User ID is required ❌' }, { status: 401 });
    }

    const user = await User.findOne({ uid });
    console.log(`User found: ${!!user}`);

    if (user) {
      return NextResponse.json({ exists: true, user });
    } else {
      return NextResponse.json({ exists: false });
    }
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
