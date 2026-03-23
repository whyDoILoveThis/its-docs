import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function POST(request: Request) {
  try {
    await dbConnect();

    const { projUid, diagram } = await request.json();

    if (!projUid || !diagram) {
      return NextResponse.json(
        { error: 'Project ID and diagram are required ❌' },
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

    project.pdmDiagrams.push(diagram);
    await project.save();

    return NextResponse.json({
      message: 'Diagram added successfully ✅',
    });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
