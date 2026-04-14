import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { MeResponse, User } from '../../../lib/leaderboard-types';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const db = getDB(locals);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      const response: MeResponse = { user: null };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const row = await db
      .prepare('SELECT id, email, display_name, email_verified_at, created_at FROM users WHERE id = ?')
      .bind(userId)
      .first<{
        id: string;
        email: string | null;
        display_name: string;
        email_verified_at: number | null;
        created_at: number;
      }>();

    if (!row) {
      const response: MeResponse = { user: null };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    const user: User = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerifiedAt: row.email_verified_at,
      createdAt: row.created_at,
    };

    const response: MeResponse = { user };
    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('me error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
