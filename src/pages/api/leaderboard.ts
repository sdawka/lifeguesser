import type { APIRoute } from 'astro';
import { getDB } from '../../lib/db';
import type {
  LeaderboardResponse,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardWindow,
} from '../../lib/leaderboard-types';

export const prerender = false;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const db = getDB(locals);
    const type = (url.searchParams.get('type') ?? 'streak') as LeaderboardType;
    const window = (url.searchParams.get('window') ?? 'allTime') as LeaderboardWindow;
    const userId = url.searchParams.get('userId');

    // Validate type
    if (type !== 'streak' && type !== 'totalScore') {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Validate window
    if (window !== 'allTime' && window !== 'daily') {
      return new Response(JSON.stringify({ error: 'Invalid window' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const orderColumn = type === 'streak' ? 'j.streak' : 'j.total_score';
    const valueColumn = type === 'streak' ? 'streak' : 'total_score';

    let whereClause = '';
    const bindings: (string | number)[] = [];

    if (window === 'daily') {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
      whereClause = 'WHERE j.created_at > ?';
      bindings.push(cutoff);
    }

    // Get top 10
    const topQuery = `
      SELECT
        u.id as user_id,
        u.display_name,
        u.email_verified_at,
        j.${valueColumn} as value,
        j.filter_label
      FROM field_journals j
      JOIN users u ON j.user_id = u.id
      ${whereClause}
      ORDER BY ${orderColumn} DESC
      LIMIT 10
    `;

    const topRows = await db
      .prepare(topQuery)
      .bind(...bindings)
      .all<{
        user_id: string;
        display_name: string;
        email_verified_at: number | null;
        value: number;
        filter_label: string;
      }>();

    const entries: LeaderboardEntry[] = (topRows.results ?? []).map((row, i) => ({
      rank: i + 1,
      userId: row.user_id,
      displayName: row.display_name,
      value: row.value,
      filterLabel: row.filter_label,
      verified: row.email_verified_at !== null,
    }));

    // Get user's rank if userId provided
    let userRank: number | null = null;
    let userValue: number | null = null;

    if (userId) {
      // Get user's best score
      const userBestQuery = `
        SELECT MAX(${valueColumn}) as best
        FROM field_journals
        WHERE user_id = ?
        ${window === 'daily' ? 'AND created_at > ?' : ''}
      `;
      const userBindings: (string | number)[] = [userId];
      if (window === 'daily') {
        userBindings.push(Date.now() - TWENTY_FOUR_HOURS_MS);
      }

      const userBestRow = await db
        .prepare(userBestQuery)
        .bind(...userBindings)
        .first<{ best: number | null }>();

      if (userBestRow?.best != null) {
        userValue = userBestRow.best;

        // Count how many scores are better
        const rankQuery = `
          SELECT COUNT(DISTINCT j.user_id) + 1 as rank
          FROM field_journals j
          ${whereClause}
          ${whereClause ? 'AND' : 'WHERE'} j.${valueColumn} > ?
        `;
        const rankBindings = window === 'daily'
          ? [Date.now() - TWENTY_FOUR_HOURS_MS, userValue]
          : [userValue];

        const rankRow = await db
          .prepare(rankQuery)
          .bind(...rankBindings)
          .first<{ rank: number }>();

        userRank = rankRow?.rank ?? null;
      }
    }

    const response: LeaderboardResponse = {
      type,
      window,
      entries,
      userRank,
      userValue,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('leaderboard error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
