import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function DELETE(request: Request) {
  try {
    await dbConnect();

    const { projUid, diagramUid } = await request.json();

    if (!projUid || !diagramUid) {
      return NextResponse.json(
        { error: 'Project ID and diagram ID are required ❌' },
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

    const filtered = project.pdmDiagrams.filter(
      (d) => d.uid !== diagramUid
    );

    if (filtered.length === project.pdmDiagrams.length) {
      return NextResponse.json(
        { error: 'Diagram not found in the project ❌' },
        { status: 404 }
      );
    }

    project.pdmDiagrams = filtered;
    await project.save();

    return NextResponse.json({
      message: 'Diagram deleted successfully ✅',
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
