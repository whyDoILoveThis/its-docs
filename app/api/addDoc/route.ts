import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function POST(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, doc } = await request.json();
    console.log(`projectId: ${projUid}, doc: ${JSON.stringify(doc)}`);

    // Validate input
    if (!projUid || !doc) {
      return NextResponse.json(
        { error: 'Project ID and doc details are required ❌' },
        { status: 400 }
      );
    }

    // Find the project by ID
    const project = await Project.findOne({uid: projUid});

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found ❌' },
        { status: 404 }
      );
    }

    // Add the doc to the project
    project.docs.push(doc);

    // Save the updated project
    await project.save();

    return NextResponse.json({
      message: 'Doc added successfully ✅',
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
