import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function PUT(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, docId, updatedDoc } = await request.json();
    console.log(`projUid: ${projUid}, docId: ${docId}, updatedDoc: ${JSON.stringify(updatedDoc)}`);

    // Validate input
    if (!projUid || !docId || !updatedDoc) {
      return NextResponse.json({ error: 'Project UID, Doc ID, and updated document data are required ❌' }, { status: 400 });
    }

    // Perform the update
    const updatedProject = await Project.findOneAndUpdate(
      { uid: projUid, 'docs.uid': docId }, // Find project by UID and specific doc by ID
      { $set: { 'docs.$': updatedDoc } }, // Use `$` to update the matched array element
      { new: true } // Return the updated document
    );

    // If project or document not found
    if (!updatedProject) {
      return NextResponse.json({ error: 'Project or document not found ❌' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Document updated successfully ✅',
      project: updatedProject,
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
