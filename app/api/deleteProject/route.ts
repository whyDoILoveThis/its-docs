import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function DELETE(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid } = await request.json();
    console.log(`Received projUid: ${projUid}`);

    // Validate input
    if (!projUid) {
      return NextResponse.json({ error: 'Project UID is required ❌' }, { status: 400 });
    }

    // Find and delete the project
    const deletedProject = await Project.findOneAndDelete({ uid: projUid });

    if (!deletedProject) {
      return NextResponse.json({ error: 'Project not found ❌' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Project deleted successfully ✅', deletedProject });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
