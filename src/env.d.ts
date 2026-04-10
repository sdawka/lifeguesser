/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type Runtime = import("@astrojs/cloudflare").Runtime<{ LIFEGUESSER_KV: KVNamespace }>;
declare namespace App {
  interface Locals extends Runtime {}
}
