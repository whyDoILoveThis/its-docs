import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

export async function PUT(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid, updates } = await request.json();
    console.log(`projUid: ${projUid}, updates: ${JSON.stringify(updates)}`);

    // Validate input
    if (!projUid || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Project ID and updates are required ❌' }, { status: 400 });
    }

    // Validate fields: Only allow specific keys to be updated
    const allowedUpdates = ['birth', 'title', 'desc', 'logoUrl'];
    const updateFields = Object.keys(updates);
    const isValidUpdate = updateFields.every((key) => allowedUpdates.includes(key));

    if (!isValidUpdate) {
      return NextResponse.json({ error: 'Invalid update fields provided ❌' }, { status: 400 });
    }

    // Perform the update
    const updatedProject = await Project.findOneAndUpdate(
      { uid: projUid }, // Find project by UID
      { $set: updates }, // Dynamically update the provided fields
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
