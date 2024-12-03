import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function POST(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, docUid, docItem } = await request.json();
    console.log(`projectId: ${projUid}, docUid: ${docUid}, docItem: ${JSON.stringify(docItem)}`);

    // Validate input
    if (!projUid || !docUid || !docItem) {
      return NextResponse.json(
        { error: 'Project ID, doc ID, and doc item are required ❌' },
        { status: 400 }
      );
    }

    // Find the project by UID
    const project = await Project.findOne({ uid: projUid });

    if (!project) {
      return NextResponse.json({ error: 'Project not found ❌' }, { status: 404 });
    }

    // Find the doc within the project
    const doc = project.docs.find((doc) => doc.uid === docUid);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found ❌' }, { status: 404 });
    }

    // Add the doc item to the doc
    doc.docItems.push(docItem);

    // Save the updated project
    await project.save();

    return NextResponse.json({
      message: 'Doc item added successfully ✅',
      project, // Optional: return the updated project for debugging
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
