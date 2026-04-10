export interface CachedFetchOptions {
  ttlSeconds?: number;
  retryDelays?: number[];
  headers?: Record<string, string>;
}

/**
 * Generic cached fetch backed by Cloudflare's Cache API. Retries on 429 with
 * the provided delay schedule + jitter and caches successful responses with a
 * long Cache-Control header so the colo serves repeats locally.
 */
export async function cachedFetch(
  url: string,
  opts: CachedFetchOptions = {}
): Promise<Response> {
  const ttlSeconds = opts.ttlSeconds ?? 604800;
  const delays = opts.retryDelays ?? [0, 1000, 2500, 5000];
  const headers = opts.headers ?? {};

  const cacheKey = new Request(url, { method: 'GET' });
  // @ts-expect-error — caches.default is Cloudflare-specific
  const cache: Cache | undefined = typeof caches !== 'undefined' ? caches.default : undefined;

  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let res!: Response;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      const jitter = Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delays[i] + jitter));
    }
    res = await fetch(url, { headers });
    if (res.status !== 429) break;
  }

  if (cache && res.ok) {
    const body = await res.clone().arrayBuffer();
    const newHeaders = new Headers(res.headers);
    newHeaders.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    newHeaders.delete('set-cookie');
    const cached = new Response(body, { status: res.status, headers: newHeaders });
    try {
      await cache.put(cacheKey, cached);
    } catch (e) {
      console.error('cache.put failed', e);
    }
  }
  return res;
}
