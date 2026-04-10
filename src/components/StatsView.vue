<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getGameHistory, clearGameHistory, type GameRecord } from '../lib/storage';

const records = ref<GameRecord[]>([]);

onMounted(() => {
  records.value = getGameHistory();
});

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bucketIndex(km: number): number {
  if (km >= 5000) return 10;
  return Math.min(9, Math.floor(km / 500));
}

const BUCKET_LABELS = [
  '0–500', '500–1k', '1k–1.5k', '1.5k–2k', '2k–2.5k',
  '2.5k–3k', '3k–3.5k', '3.5k–4k', '4k–4.5k', '4.5k–5k', '5k+'
];

const allRounds = computed(() => records.value.flatMap(r => r.rounds));

const totalExpeditions = computed(() => records.value.length);
const totalSpecimens = computed(() => allRounds.value.length);
const bestStreak = computed(() => records.value.reduce((m, r) => Math.max(m, r.finalStreak), 0));
const medianDistance = computed(() => median(allRounds.value.map(r => r.distanceKm)));

const histogram = computed(() => {
  const counts = new Array(11).fill(0);
  for (const r of allRounds.value) counts[bucketIndex(r.distanceKm)]++;
  return counts;
});

const medianBucketIdx = computed(() =>
  allRounds.value.length > 0 ? bucketIndex(medianDistance.value) : -1
);

const maxBucketCount = computed(() => Math.max(1, ...histogram.value));

function barX(i: number): number {
  const chartW = 760;
  const pad = 20;
  const bw = chartW / 11;
  return pad + i * bw + bw * 0.1;
}
function barW(): number {
  const chartW = 760;
  const bw = chartW / 11;
  return bw * 0.8;
}
function barY(count: number): number {
  const chartH = 180;
  const top = 20;
  return top + chartH - (count / maxBucketCount.value) * chartH;
}
function barH(count: number): number {
  const chartH = 180;
  return (count / maxBucketCount.value) * chartH;
}

type TaxonAgg = {
  taxonName: string;
  games: number;
  bestStreak: number;
  medianDistance: number;
};

const byTaxon = computed<TaxonAgg[]>(() => {
  const map = new Map<string, { games: Set<number>; best: number; dists: number[] }>();
  records.value.forEach((rec, idx) => {
    const seenInGame = new Set<string>();
    for (const round of rec.rounds) {
      const name = round.taxonName || '—';
      if (!map.has(name)) map.set(name, { games: new Set(), best: 0, dists: [] });
      const entry = map.get(name)!;
      if (!seenInGame.has(name)) {
        entry.games.add(idx);
        seenInGame.add(name);
      }
      entry.best = Math.max(entry.best, rec.finalStreak);
      entry.dists.push(round.distanceKm);
    }
  });
  return Array.from(map.entries())
    .map(([taxonName, v]) => ({
      taxonName,
      games: v.games.size,
      bestStreak: v.best,
      medianDistance: median(v.dists),
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 15);
});

const recentRecords = computed(() => records.value.slice(0, 10));

function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function sparkline(distances: number[]): string {
  if (distances.length === 0) return '';
  const w = 120, h = 24, pad = 2;
  const max = Math.max(...distances, 1);
  if (distances.length === 1) {
    const y = h - pad - (distances[0] / max) * (h - pad * 2);
    return `M ${pad} ${y} L ${w - pad} ${y}`;
  }
  const step = (w - pad * 2) / (distances.length - 1);
  return distances
    .map((d, i) => {
      const x = pad + i * step;
      const y = h - pad - (d / max) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function formatKm(n: number): string {
  if (n === 0 && allRounds.value.length === 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

function onClear() {
  if (typeof window === 'undefined') return;
  if (window.confirm('Clear all history?')) {
    clearGameHistory();
    records.value = [];
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <!-- Summary bar -->
    <div class="flex items-stretch border border-ink mb-12 rise rise-3">
      <div class="flex-1 px-4 py-3 flex flex-col items-start">
        <div class="eyebrow">Expeditions</div>
        <div class="font-display text-4xl md:text-5xl leading-none mt-1" style="font-variation-settings: 'opsz' 144;">
          {{ totalExpeditions }}
        </div>
      </div>
      <div class="w-px bg-ink"></div>
      <div class="flex-1 px-4 py-3 flex flex-col items-start">
        <div class="eyebrow">Specimens</div>
        <div class="font-display text-4xl md:text-5xl leading-none mt-1" style="font-variation-settings: 'opsz' 144;">
          {{ totalSpecimens }}
        </div>
      </div>
      <div class="w-px bg-ink"></div>
      <div class="flex-1 px-4 py-3 flex flex-col items-start">
        <div class="eyebrow">Best Streak</div>
        <div class="font-display text-4xl md:text-5xl leading-none mt-1 italic" style="font-variation-settings: 'opsz' 144;">
          {{ bestStreak }}
        </div>
      </div>
      <div class="w-px bg-ink"></div>
      <div class="flex-1 px-4 py-3 flex flex-col items-start">
        <div class="eyebrow">Median Distance</div>
        <div class="font-mono text-2xl md:text-3xl font-medium leading-none mt-2 text-rust">
          {{ formatKm(medianDistance) }}<span class="text-sm ml-1 text-ink-soft">km</span>
        </div>
      </div>
    </div>

    <!-- Section I: Histogram -->
    <section class="mb-14 rise rise-4">
      <div class="flex items-baseline gap-4 mb-4">
        <div class="eyebrow">I · Distance Histogram</div>
        <div class="flex-1 h-px bg-ink opacity-30"></div>
      </div>
      <div v-if="allRounds.length === 0" class="eyebrow italic font-serif normal-case tracking-normal text-base">
        No data yet.
      </div>
      <svg v-else viewBox="0 0 800 240" class="w-full">
        <!-- y ticks -->
        <g font-family="JetBrains Mono, monospace" font-size="9" fill="#3d4f44">
          <text v-for="pct in [0, 25, 50, 75, 100]" :key="pct"
                :x="14" :y="20 + 180 - (pct / 100) * 180 + 3"
                text-anchor="end">
            {{ Math.round((pct / 100) * maxBucketCount) }}
          </text>
        </g>
        <!-- baseline -->
        <line x1="20" y1="200" x2="780" y2="200" stroke="#1a2e24" stroke-width="1" />
        <!-- bars -->
        <g>
          <rect v-for="(count, i) in histogram" :key="i"
                :x="barX(i)" :y="barY(count)"
                :width="barW()" :height="barH(count)"
                :fill="i === medianBucketIdx ? '#9b3d1e' : '#1a2e24'" />
        </g>
        <!-- x labels -->
        <g font-family="JetBrains Mono, monospace" font-size="10" fill="#1a2e24" text-anchor="middle">
          <text v-for="(label, i) in BUCKET_LABELS" :key="i"
                :x="barX(i) + barW() / 2" :y="220">
            {{ label }}
          </text>
        </g>
        <text x="400" y="236" font-family="JetBrains Mono, monospace" font-size="9"
              fill="#3d4f44" text-anchor="middle" letter-spacing="2">
          DISTANCE (KM)
        </text>
      </svg>
    </section>

    <!-- Section II: By Taxon -->
    <section class="mb-14 rise rise-5">
      <div class="flex items-baseline gap-4 mb-4">
        <div class="eyebrow">II · By Taxon</div>
        <div class="flex-1 h-px bg-ink opacity-30"></div>
      </div>
      <div v-if="byTaxon.length === 0" class="eyebrow italic font-serif normal-case tracking-normal text-base">
        No data yet.
      </div>
      <table v-else class="w-full border-collapse border border-ink">
        <thead>
          <tr class="border-b border-ink">
            <th class="eyebrow text-left px-3 py-2">Taxon</th>
            <th class="eyebrow text-right px-3 py-2">Games</th>
            <th class="eyebrow text-right px-3 py-2">Best Streak</th>
            <th class="eyebrow text-right px-3 py-2">Median Distance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in byTaxon" :key="t.taxonName"
              :class="i % 2 === 1 ? 'bg-paper-dark/40' : ''">
            <td class="font-serif px-3 py-2 italic">{{ t.taxonName }}</td>
            <td class="font-mono text-sm text-right px-3 py-2">{{ t.games }}</td>
            <td class="font-mono text-sm text-right px-3 py-2">{{ t.bestStreak }}</td>
            <td class="font-mono text-sm text-right px-3 py-2">{{ formatKm(t.medianDistance) }} km</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Section III: Recent -->
    <section class="mb-14 rise rise-6">
      <div class="flex items-baseline gap-4 mb-4">
        <div class="eyebrow">III · Recent Expeditions</div>
        <div class="flex-1 h-px bg-ink opacity-30"></div>
      </div>
      <div v-if="recentRecords.length === 0" class="eyebrow italic font-serif normal-case tracking-normal text-base">
        No data yet.
      </div>
      <div v-else>
        <div v-for="(rec, i) in recentRecords" :key="rec.at + '-' + i">
          <div class="flex items-center gap-4 py-3">
            <div class="font-mono text-xs text-ink-soft w-36 shrink-0">{{ formatDate(rec.at) }}</div>
            <div class="font-display italic flex-1 truncate" style="font-variation-settings: 'opsz' 144;">
              {{ rec.filterLabel }}
            </div>
            <div class="font-mono text-xs">Streak: {{ rec.finalStreak }}</div>
            <svg :viewBox="`0 0 120 24`" width="120" height="24" class="shrink-0">
              <path :d="sparkline(rec.rounds.map(r => r.distanceKm))"
                    fill="none" stroke="#1a2e24" stroke-width="1.25" />
            </svg>
          </div>
          <div v-if="i < recentRecords.length - 1" class="hairline opacity-30"></div>
        </div>
      </div>
    </section>

    <!-- Footer action -->
    <div class="flex justify-center pt-4 pb-8">
      <button type="button" class="btn-ghost" @click="onClear">Clear Archive</button>
    </div>
  </div>
</template>
