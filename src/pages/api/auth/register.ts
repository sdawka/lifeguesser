import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import type { RegisterRequest, RegisterResponse } from '../../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDB(locals);
    const body = (await request.json()) as RegisterRequest;

    if (!body.userId || !body.nickname) {
      return new Response(JSON.stringify({ error: 'userId and nickname required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const nickname = body.nickname.trim().slice(0, 30);
    if (nickname.length < 1) {
      return new Response(JSON.stringify({ error: 'Nickname too short' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check if user already exists
    const existing = await db
      .prepare('SELECT id, display_name FROM users WHERE id = ?')
      .bind(body.userId)
      .first<{ id: string; display_name: string }>();

    if (existing) {
      const response: RegisterResponse = {
        userId: existing.id,
        displayName: existing.display_name,
      };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Create new user
    const now = Date.now();
    await db
      .prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)')
      .bind(body.userId, nickname, now)
      .run();

    const response: RegisterResponse = {
      userId: body.userId,
      displayName: nickname,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('register error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
