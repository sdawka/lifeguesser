import type { KVNamespace } from '@cloudflare/workers-types';
import type { TaxonRepo } from './types';
import { KvTaxonRepo } from './kv';
// import { D1TaxonRepo } from './d1'; // enabled when D1 binding is live

interface RuntimeEnv {
  LIFEGUESSER_KV?: KVNamespace;
  // DB?: D1Database;
}

interface LocalsShape {
  runtime?: { env?: RuntimeEnv };
}

export function getTaxonRepo(env: RuntimeEnv | LocalsShape | any): TaxonRepo {
  const resolved: RuntimeEnv | undefined = env?.runtime?.env ?? env;
  // Future: if (resolved?.DB) return new D1TaxonRepo(resolved.DB);
  if (!resolved?.LIFEGUESSER_KV) throw new Error('LIFEGUESSER_KV binding missing');
  return new KvTaxonRepo(resolved.LIFEGUESSER_KV);
}
