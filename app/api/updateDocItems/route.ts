import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function POST(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, docUid, docItems } = await request.json();
    console.log(`projectId: ${projUid}, docUid: ${docUid}`);

    if (!projUid || !docUid || !docItems) {
      return NextResponse.json(
        { error: 'Project ID, doc ID, and updated doc items are required ❌' },
        { status: 400 }
      );
    }

    const project = await Project.findOne({ uid: projUid });
    if (!project) {
      return NextResponse.json({ error: 'Project not found ❌' }, { status: 404 });
    }

    const doc = project.docs.find((doc) => doc.uid === docUid);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found ❌' }, { status: 404 });
    }

    // Update doc items
    doc.docItems = docItems;

    await project.save();

    return NextResponse.json({ message: 'Doc items updated successfully ✅' });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
