import type { KVNamespace } from '@cloudflare/workers-types';

/**
 * In-memory KV shim used when running `astro dev` without a real Cloudflare
 * binding. Only implements the subset of KVNamespace we actually use
 * (`get`, `put`, `delete`) and respects `expirationTtl`.
 *
 * In `wrangler pages dev` / production the real KV is used via
 * `locals.runtime.env.LIFEGUESSER_KV`.
 */
type Entry = { value: string; expiresAt?: number };
const memStore: Map<string, Entry> = (globalThis as any).__lifeguesserMemKV ??= new Map();

const memKV = {
  async get(key: string, type?: 'text' | 'json') {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      memStore.delete(key);
      return null;
    }
    return type === 'json' ? JSON.parse(entry.value) : entry.value;
  },
  async put(key: string, value: string, opts?: { expirationTtl?: number }) {
    memStore.set(key, {
      value,
      expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
    });
  },
  async delete(key: string) {
    memStore.delete(key);
  },
};

let warned = false;

export function getKV(locals: any): KVNamespace {
  const real = locals?.runtime?.env?.LIFEGUESSER_KV;
  if (real) return real as KVNamespace;
  if (!warned) {
    console.warn('[lifeguesser] LIFEGUESSER_KV binding not found — using in-memory fallback (dev only).');
    warned = true;
  }
  return memKV as unknown as KVNamespace;
}
