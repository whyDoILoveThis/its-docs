import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function PUT(request: Request) {
  try {
    await dbConnect();

    const { projUid, diagramUid, updates } = await request.json();

    if (!projUid || !diagramUid || !updates) {
      return NextResponse.json(
        { error: 'Project ID, diagram ID, and updates are required ❌' },
        { status: 400 }
      );
    }

    const project = await Project.findOne({ uid: projUid });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found ❌' },
        { status: 404 }
      );
    }

    const diagram = project.pdmDiagrams.find(
      (d) => d.uid === diagramUid
    );

    if (!diagram) {
      return NextResponse.json(
        { error: 'Diagram not found ❌' },
        { status: 404 }
      );
    }

    if (updates.nodes !== undefined) diagram.nodes = updates.nodes;
    if (updates.edges !== undefined) diagram.edges = updates.edges;
    if (updates.orientation !== undefined) diagram.orientation = updates.orientation;
    if (updates.title !== undefined) diagram.title = updates.title;

    await project.save();

    return NextResponse.json({
      message: 'Diagram updated successfully ✅',
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
