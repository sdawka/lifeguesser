import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { getKV } from '../../../lib/kv';
import { sendEmail } from '../../../lib/resend';
import type { SendMagicLinkRequest, SendMagicLinkResponse } from '../../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const db = getDB(locals);
    const kv = getKV(locals);
    const body = (await request.json()) as SendMagicLinkRequest;

    if (!body.userId || !body.email) {
      return new Response(JSON.stringify({ error: 'userId and email required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check user exists
    const user = await db
      .prepare('SELECT id, display_name FROM users WHERE id = ?')
      .bind(body.userId)
      .first<{ id: string; display_name: string }>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Check if email already used by another user
    const emailTaken = await db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(body.email, body.userId)
      .first();

    if (emailTaken) {
      return new Response(JSON.stringify({ error: 'Email already in use' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Generate token and store in KV with 15-min TTL
    const token = crypto.randomUUID();
    const tokenData = JSON.stringify({ userId: body.userId, email: body.email });
    await kv.put(`magic:${token}`, tokenData, { expirationTtl: 900 });

    // Build verification URL
    const verifyUrl = `${url.origin}/api/auth/verify?token=${token}`;

    // Send email
    const result = await sendEmail(locals, {
      to: body.email,
      subject: 'Verify your LifeGuesser identity',
      html: `
        <h2>Welcome, ${user.display_name}!</h2>
        <p>Click the link below to verify your email and claim your spot on the leaderboard:</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2d5016;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
        <p>This link expires in 15 minutes.</p>
        <p style="color:#666;font-size:12px;">If you didn't request this, you can ignore this email.</p>
      `,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error ?? 'Failed to send email' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const response: SendMagicLinkResponse = { sent: true };
    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('send-magic-link error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
