import type { KVNamespace, D1Database } from '@cloudflare/workers-types';
import type { TaxonRepo } from './types';
import { KvTaxonRepo } from './kv';
import { D1TaxonRepo } from './d1';
import { D1ObservationRepo, type ObservationRepo } from './observations';

interface RuntimeEnv {
  LIFEGUESSER_KV?: KVNamespace;
  DB?: D1Database;
}

interface LocalsShape {
  runtime?: { env?: RuntimeEnv };
}

function resolveEnv(env: RuntimeEnv | LocalsShape | any): RuntimeEnv | undefined {
  return env?.runtime?.env ?? env;
}

export function getTaxonRepo(env: RuntimeEnv | LocalsShape | any): TaxonRepo {
  const resolved = resolveEnv(env);

  // Prefer D1 for pre-populated enrichment data
  if (resolved?.DB) return new D1TaxonRepo(resolved.DB);

  // Fall back to KV for runtime caching
  if (!resolved?.LIFEGUESSER_KV) throw new Error('LIFEGUESSER_KV or DB binding missing');
  return new KvTaxonRepo(resolved.LIFEGUESSER_KV);
}

export function getObservationRepo(env: RuntimeEnv | LocalsShape | any): ObservationRepo | null {
  const resolved = resolveEnv(env);
  return resolved?.DB ? new D1ObservationRepo(resolved.DB) : null;
}
