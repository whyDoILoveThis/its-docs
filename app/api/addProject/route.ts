import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function POST(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { project } = await request.json();
    console.log(` project: ${JSON.stringify(project)}`);

    // Validate input
    if (!project) {
      return NextResponse.json({ error: 'project details are required ❌' }, { status: 400 });
    }

    const newProject = new Project({
      ...project,
    });

    // Save the new project
    await newProject.save();

    return NextResponse.json({ message: 'Project added successfully ✅', project: newProject });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
