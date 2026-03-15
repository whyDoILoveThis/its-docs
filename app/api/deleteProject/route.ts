import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET = 'images';

/** Extract storage path from a Supabase public URL or return as-is. */
function storagePath(url: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx !== -1 ? url.slice(idx + marker.length) : url;
}

async function deleteStorageImage(url: string) {
  if (!url || (!url.startsWith('http') && url.length < 10)) return;
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath(url)]);
}

export async function DELETE(request: Request) {
  try {
    console.log('Connecting to MongoDB...');
    await dbConnect();
    console.log('Connected to MongoDB.');

    const { projUid } = await request.json();
    console.log(`Received projUid: ${projUid}`);

    // Validate input
    if (!projUid) {
      return NextResponse.json({ error: 'Project UID is required ❌' }, { status: 400 });
    }

    // Find and delete the project
    const deletedProject = await Project.findOneAndDelete({ uid: projUid });

    if (!deletedProject) {
      return NextResponse.json({ error: 'Project not found ❌' }, { status: 404 });
    }

    // Clean up: delete project logo from storage
    if (deletedProject.logoUrl) {
      deleteStorageImage(deletedProject.logoUrl).catch(console.error);
    }

    // Clean up: delete all doc item images from storage
    if (deletedProject.docs) {
      for (const doc of deletedProject.docs) {
        if (doc.docItems) {
          for (const item of doc.docItems) {
            if (item.style === 'pic' && item.text) {
              deleteStorageImage(item.text).catch(console.error);
            }
          }
        }
      }
    }

    return NextResponse.json({ message: 'Project deleted successfully ✅', deletedProject });
  } catch (error) {
    console.error('❌ An error occurred:', error);
    return NextResponse.json({ error: 'Internal Server Error ❌' }, { status: 500 });
  }
}
