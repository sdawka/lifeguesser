import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { getKV } from '../../../lib/kv';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  try {
    const db = getDB(locals);
    const kv = getKV(locals);
    const token = url.searchParams.get('token');

    if (!token) {
      return redirect('/leaderboard?error=missing-token');
    }

    // Get and delete token from KV
    const tokenData = await kv.get(`magic:${token}`);
    if (!tokenData) {
      return redirect('/leaderboard?error=invalid-token');
    }
    await kv.delete(`magic:${token}`);

    const { userId, email } = JSON.parse(tokenData) as { userId: string; email: string };

    // Update user with verified email
    const now = Date.now();
    await db
      .prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?')
      .bind(email, now, userId)
      .run();

    return redirect('/leaderboard?verified=true');
  } catch (err: any) {
    console.error('verify error:', err);
    return redirect('/leaderboard?error=verification-failed');
  }
};
