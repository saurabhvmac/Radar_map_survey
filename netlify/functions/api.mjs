// Netlify Function: serves every /api/* request. Data is kept in Netlify Blobs (built in, no setup).
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/app.mjs';

export default async (req) => {
  try {
    const store = getStore({ name: 'career-survey', consistency: 'strong' });
    return await handle(req, store);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Something went wrong on the server. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/*' };
