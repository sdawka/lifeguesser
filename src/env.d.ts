/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type D1Database = import("@cloudflare/workers-types").D1Database;
type Runtime = import("@astrojs/cloudflare").Runtime<{
  LIFEGUESSER_KV: KVNamespace;
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}>;
declare namespace App {
  interface Locals extends Runtime {}
}
