import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type { SubmitJournalRequest, SubmitJournalResponse } from '../../lib/leaderboard-types';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getDB(locals);
    const body = (await request.json()) as SubmitJournalRequest;

    // Validate required fields
    if (!body.journalId || !body.userId || body.streak == null || body.totalScore == null) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Verify user exists
    const user = await db
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(body.userId)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const now = Date.now();

    // Insert field journal
    await db
      .prepare(`
        INSERT INTO field_journals (id, user_id, streak, total_score, filter_hash, filter_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        body.journalId,
        body.userId,
        body.streak,
        body.totalScore,
        body.filterHash ?? '',
        body.filterLabel ?? 'All · World',
        now
      )
      .run();

    // Insert sightings
    if (body.rounds && body.rounds.length > 0) {
      for (const round of body.rounds) {
        await db
          .prepare(`
            INSERT INTO sightings (journal_id, round_index, taxon_id, taxon_name, distance_km, score, hints_used, passed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            body.journalId,
            round.roundIndex,
            round.taxonId,
            round.taxonName,
            round.distanceKm,
            round.score,
            round.hintsUsed,
            round.passed ? 1 : 0
          )
          .run();
      }
    }

    // Calculate user's rank for streak
    const streakRankRow = await db
      .prepare(`
        SELECT COUNT(*) + 1 as rank FROM field_journals
        WHERE streak > ?
      `)
      .bind(body.streak)
      .first<{ rank: number }>();

    // Calculate user's rank for total score
    const scoreRankRow = await db
      .prepare(`
        SELECT COUNT(*) + 1 as rank FROM field_journals
        WHERE total_score > ?
      `)
      .bind(body.totalScore)
      .first<{ rank: number }>();

    const response: SubmitJournalResponse = {
      journalId: body.journalId,
      rank: {
        streak: streakRankRow?.rank ?? 1,
        totalScore: scoreRankRow?.rank ?? 1,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('journal submit error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
