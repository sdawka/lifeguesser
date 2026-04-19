import type { D1Database } from '@cloudflare/workers-types';
import type { Observation } from '../../types';

export type ContinentCode = 'NA' | 'SA' | 'EU' | 'AF' | 'AS' | 'OC';

export interface ObservationFilters {
  categoryIds?: number[];
  continents?: ContinentCode[];
}

export interface ObservationSeed extends Observation {
  categoryId: number;
  continent: ContinentCode;
}

export interface ObservationRepo {
  pickRandom(filters: ObservationFilters): Promise<Observation | null>;
  countBy(filters: ObservationFilters): Promise<number>;
  bulkInsert(rows: ObservationSeed[]): Promise<void>;
}

interface ObsRow {
  id: number;
  taxon_id: number;
  taxon_name: string;
  lat: number;
  lng: number;
  photo_urls: string;
  observer_login: string;
  license: string | null;
  observation_url: string;
  ancestry: string;
}

function rowToObservation(row: ObsRow): Observation {
  return {
    id: row.id,
    taxonId: row.taxon_id,
    taxonName: row.taxon_name,
    lat: row.lat,
    lng: row.lng,
    photoUrls: JSON.parse(row.photo_urls) as string[],
    observerLogin: row.observer_login,
    license: row.license,
    observationUrl: row.observation_url,
    ancestry: JSON.parse(row.ancestry) as { rank: string; name: string }[],
  };
}

function buildWhere(filters: ObservationFilters): { clause: string; binds: unknown[] } {
  const parts: string[] = [];
  const binds: unknown[] = [];

  if (filters.categoryIds?.length) {
    parts.push(`category_id IN (${filters.categoryIds.map(() => '?').join(',')})`);
    binds.push(...filters.categoryIds);
  }
  if (filters.continents?.length) {
    parts.push(`continent IN (${filters.continents.map(() => '?').join(',')})`);
    binds.push(...filters.continents);
  }

  return {
    clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
    binds,
  };
}

export class D1ObservationRepo implements ObservationRepo {
  constructor(private readonly db: D1Database) {}

  async pickRandom(filters: ObservationFilters): Promise<Observation | null> {
    const { clause, binds } = buildWhere(filters);
    const sql = `SELECT id, taxon_id, taxon_name, lat, lng, photo_urls, observer_login,
                        license, observation_url, ancestry
                 FROM observations ${clause}
                 ORDER BY RANDOM() LIMIT 1`;
    const row = await this.db.prepare(sql).bind(...binds).first<ObsRow>();
    return row ? rowToObservation(row) : null;
  }

  async countBy(filters: ObservationFilters): Promise<number> {
    const { clause, binds } = buildWhere(filters);
    const row = await this.db.prepare(`SELECT COUNT(*) AS n FROM observations ${clause}`)
      .bind(...binds)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async bulkInsert(rows: ObservationSeed[]): Promise<void> {
    if (!rows.length) return;
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO observations (
        id, taxon_id, taxon_name, lat, lng, photo_urls, observer_login,
        license, observation_url, ancestry, category_id, continent, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const batch = rows.map((r) => stmt.bind(
      r.id,
      r.taxonId ?? 0,
      r.taxonName,
      r.lat,
      r.lng,
      JSON.stringify(r.photoUrls),
      r.observerLogin,
      r.license,
      r.observationUrl,
      JSON.stringify(r.ancestry),
      r.categoryId,
      r.continent,
      now,
    ));
    await this.db.batch(batch);
  }
}
