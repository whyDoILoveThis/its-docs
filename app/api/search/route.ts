// pages/api/search.js
import dbConnect from '../../../lib/mongodb';
import Project from '@/models/Project';

// Named export for GET requests
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const term = searchParams.get('term');

    if (!term || term.trim() === '') {
      return new Response(JSON.stringify({ error: 'Search term is required ❌' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await dbConnect(); // Connect to MongoDB

    // Perform a case-insensitive search on the "name" field
    const projects = await Project.find({
      title: { $regex: term, $options: 'i' },
    });

    return new Response(JSON.stringify({ projects }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Error searching for projects:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error ❌' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
