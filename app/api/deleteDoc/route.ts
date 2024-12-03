import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function DELETE(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, docId } = await request.json();
    console.log(`projectId: ${projUid}, docId: ${docId}`);

    // Validate input
    if (!projUid || !docId) {
      return NextResponse.json(
        { error: 'Project ID and doc ID are required ❌' },
        { status: 400 }
      );
    }

    // Find the project by UID
    const project = await Project.findOne({ uid: projUid });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found ❌' },
        { status: 404 }
      );
    }

    // Remove the doc with the matching ID
    const updatedDocs = project.docs.filter((doc: Doc) => doc.uid !== docId);

    if (updatedDocs.length === project.docs.length) {
      return NextResponse.json(
        { error: 'Doc not found in the project ❌' },
        { status: 404 }
      );
    }

    // Update the project's docs array
    project.docs = updatedDocs;

    // Save the updated project
    await project.save();

    return NextResponse.json({
      message: 'Doc deleted successfully ✅',
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
