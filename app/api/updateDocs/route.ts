import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function PUT(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, docs } = await request.json();
    console.log(`projUid: ${projUid}, docs: ${JSON.stringify(docs)}`);

    // Validate input
    if (!projUid || !docs ) {
      return NextResponse.json({ error: 'Project ID and docs are required ❌' }, { status: 400 });
    }


    // Perform the update
    const updatedProject = await Project.findOneAndUpdate(
      { uid: projUid }, // Find project by UID
      { $set: {docs} }, // Dynamically update the provided fields
      { new: true } // Return the updated document
    );

    // If project not found
    if (!updatedProject) {
      return NextResponse.json({ error: 'Project not found ❌' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Project updated successfully ✅',
      project: updatedProject,
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
