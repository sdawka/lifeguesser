<script setup lang="ts">
import { ref, computed, onMounted, useTemplateRef, watch, nextTick } from 'vue';
import type { Filters, RoundPayload, GuessResult } from '../types';
import { hashFiltersSync, TAXON_PRESETS, PLACE_PRESETS } from '../lib/filters';
import {
  getBestStreak,
  setBestStreak,
  appendGameRecord,
  type GameRecord,
  type GameRoundRecord,
} from '../lib/storage';
import {
  getUserId,
  setUserId,
  getUserName,
  setUserName,
  generateUserId,
} from '../lib/user-storage';
import { generateFunnyName } from '../lib/funny-names';
import { thresholdForRound } from '../lib/scoring';
import StreakHud from './StreakHud.vue';
import PhotoPanel from './PhotoPanel.vue';
import PhotoLightbox from './PhotoLightbox.vue';
import HintCategories from './HintCategories.vue';
import OracleHint from './OracleHint.vue';
import GuessMap from './GuessMap.vue';
import ResultMap from './ResultMap.vue';
import SubmitJournalModal from './SubmitJournalModal.vue';
import type { SightingInput, SubmitJournalResponse } from '../lib/leaderboard-types';

type State = 'loading' | 'guessing' | 'revealing' | 'gameover';

const props = defineProps<{ filters: Filters }>();

const state = ref<State>('loading');
const round = ref<RoundPayload | null>(null);
const prefetchedRound = ref<RoundPayload | null>(null);
const pendingGuess = ref<{ lat: number; lng: number } | null>(null);
const mobilePane = ref<'plate' | 'chart'>('plate');
const result = ref<GuessResult | null>(null);
const roundIndex = ref(0);
const streak = ref(0);
const expeditionBestStreak = ref(0);
const bestStreak = ref(0);
const errorMsg = ref<string | null>(null);
const submitting = ref(false);
const hintsUsed = ref(0);
const multiplier = computed(() => [1, 0.8, 0.6, 0.4, 0.2][hintsUsed.value] ?? 1);
const lightboxOpen = ref(false);
const lightboxUrl = ref('');
const lightboxFromRect = ref<DOMRect | null>(null);
const expeditionRounds = ref<GameRoundRecord[]>([]);
const historySaved = ref(false);
const showSubmitModal = ref(false);
const journalSubmitted = ref(false);
const submittedRank = ref<{ streak: number; totalScore: number } | null>(null);
const autoSubmitting = ref(false);
const autoSubmitName = ref<string | null>(null);

const filterHash = computed(() => hashFiltersSync(props.filters));
const threshold = computed(() => thresholdForRound(roundIndex.value));

const roundsForSubmit = computed((): SightingInput[] =>
  expeditionRounds.value.map((r, i) => ({
    roundIndex: i,
    taxonId: null,
    taxonName: r.taxonName,
    distanceKm: r.distanceKm,
    score: r.score,
    hintsUsed: r.hintsUsed,
    passed: r.passed,
  }))
);

const totalScore = computed(() =>
  expeditionRounds.value.reduce((sum, r) => sum + r.score, 0)
);

const guessMapRef = useTemplateRef<InstanceType<typeof GuessMap>>('guessMapRef');
const fieldNotesRef = useTemplateRef<HTMLElement>('fieldNotesRef');

function roundUrl(): string {
  const params = new URLSearchParams();
  if (props.filters.taxonIds?.length) params.set('taxa', props.filters.taxonIds.join(','));
  if (props.filters.placeIds?.length) params.set('places', props.filters.placeIds.join(','));
  const qs = params.toString();
  return '/api/round' + (qs ? '?' + qs : '');
}

function warmImageCache(urls: string[]) {
  if (typeof window === 'undefined') return;
  for (const u of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
  }
}

async function loadRound() {
  errorMsg.value = null;
  result.value = null;
  pendingGuess.value = null;
  hintsUsed.value = 0;
  mobilePane.value = 'plate';

  // Fast path: a prefetched round is ready to go.
  if (prefetchedRound.value) {
    round.value = prefetchedRound.value;
    prefetchedRound.value = null;
    state.value = 'guessing';
    guessMapRef.value?.reset?.();
    warmImageCache(round.value.photoUrls);
    return;
  }

  state.value = 'loading';
  try {
    const res = await fetch(roundUrl());
    if (!res.ok) throw new Error('Failed to load observation');
    round.value = (await res.json()) as RoundPayload;
    state.value = 'guessing';
    guessMapRef.value?.reset?.();
    warmImageCache(round.value.photoUrls);
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to load observation';
    state.value = 'guessing';
  }
}

async function prefetchNextRound() {
  // Don't stampede: skip if we already have one queued.
  if (prefetchedRound.value) return;
  try {
    const res = await fetch(roundUrl());
    if (!res.ok) return;
    const next = (await res.json()) as RoundPayload;
    prefetchedRound.value = next;
    warmImageCache(next.photoUrls);
  } catch {
    // Silent — prefetch is best-effort.
  }
}

function onGuess(lat: number, lng: number) {
  pendingGuess.value = { lat, lng };
}

async function submitGuess() {
  if (!pendingGuess.value || !round.value) return;
  submitting.value = true;
  try {
    const res = await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundId: round.value.roundId,
        guessLat: pendingGuess.value.lat,
        guessLng: pendingGuess.value.lng,
        roundIndex: roundIndex.value,
        hintsUsed: hintsUsed.value,
      }),
    });
    if (!res.ok) throw new Error('Failed to submit guess');
    const r = (await res.json()) as GuessResult;
    result.value = r;
    // On mobile, show the chart so the user sees their pin vs the actual.
    mobilePane.value = 'chart';
    // Scroll the field-notes card into view to reveal the answer.
    nextTick(() => {
      fieldNotesRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    expeditionRounds.value.push({
      distanceKm: r.distanceKm,
      score: r.score,
      hintsUsed: r.hintsUsed,
      passed: r.passed,
      taxonName: r.taxonName,
    });
    // Score is per-round and always accumulates; streak tracks consecutive
    // correct answers and resets on a miss. Both are separate metrics.
    if (r.passed) {
      streak.value += 1;
      if (streak.value > expeditionBestStreak.value) expeditionBestStreak.value = streak.value;
    } else {
      streak.value = 0;
    }
    if (expeditionBestStreak.value > bestStreak.value) {
      bestStreak.value = expeditionBestStreak.value;
      setBestStreak(filterHash.value, bestStreak.value);
    }
    state.value = 'revealing';
    // Quietly queue up the next specimen + warm its photo cache while
    // the user reads the field-notes card.
    prefetchNextRound();
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to submit guess';
  } finally {
    submitting.value = false;
  }
}

function nextRound() {
  roundIndex.value += 1;
  loadRound();
}

function endExpedition() {
  if (!expeditionRounds.value.length) return;
  state.value = 'gameover';
  saveHistory();
  // Auto-submit notable expeditions (peak streak ≥ 5).
  if (expeditionBestStreak.value >= 5) {
    autoSubmitJournal();
  }
}

function saveHistory() {
  if (historySaved.value || !expeditionRounds.value.length) return;
  const taxonLabel =
    TAXON_PRESETS.find((p) =>
      p.taxonIds?.length === props.filters.taxonIds?.length &&
      p.taxonIds?.every((id, i) => id === props.filters.taxonIds?.[i])
    )?.label ?? 'Any';
  const placeLabel =
    PLACE_PRESETS.find((p) =>
      p.placeIds?.length === props.filters.placeIds?.length &&
      p.placeIds?.every((id, i) => id === props.filters.placeIds?.[i])
    )?.label ?? 'World';
  const rec: GameRecord = {
    at: Date.now(),
    filterHash: filterHash.value,
    filterLabel: `${taxonLabel} · ${placeLabel}`,
    finalStreak: expeditionBestStreak.value,
    rounds: expeditionRounds.value.slice(),
  };
  appendGameRecord(rec);
  historySaved.value = true;
}

async function autoSubmitJournal() {
  if (journalSubmitted.value) return;
  autoSubmitting.value = true;

  try {
    // Get or generate userId
    let userId = getUserId();
    if (!userId) {
      userId = generateUserId();
      setUserId(userId);
    }

    // Get existing userName or generate a funny name
    let name = getUserName();
    if (!name) {
      name = generateFunnyName();
      setUserName(name);
    }

    // Register user
    const regRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname: name }),
    });

    if (!regRes.ok) {
      const data = await regRes.json();
      throw new Error(data.error ?? 'Registration failed');
    }

    // Submit journal
    const journalRes = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        journalId: crypto.randomUUID(),
        userId,
        streak: expeditionBestStreak.value,
        totalScore: totalScore.value,
        filterHash: filterHash.value,
        filterLabel: 'Expedition',
        rounds: roundsForSubmit.value,
      }),
    });

    if (!journalRes.ok) {
      const data = await journalRes.json();
      throw new Error(data.error ?? 'Submission failed');
    }

    journalSubmitted.value = true;
    autoSubmitName.value = name;
  } catch (e: any) {
    console.error('Auto-submit failed:', e?.message);
  } finally {
    autoSubmitting.value = false;
  }
}

function onJournalSubmitted(response: SubmitJournalResponse) {
  journalSubmitted.value = true;
  submittedRank.value = response.rank;
}

function playAgain() {
  streak.value = 0;
  expeditionBestStreak.value = 0;
  roundIndex.value = 0;
  expeditionRounds.value = [];
  historySaved.value = false;
  journalSubmitted.value = false;
  submittedRank.value = null;
  showSubmitModal.value = false;
  autoSubmitName.value = null;
  prefetchedRound.value = null;
  loadRound();
}

onMounted(() => {
  bestStreak.value = getBestStreak(filterHash.value) ?? 0;
  loadRound();
});

// When the mobile pane toggles to 'chart' from a hidden state, Leaflet needs
// a resize nudge so its tile grid fills the now-visible container.
watch(mobilePane, async (pane) => {
  if (pane === 'chart') {
    await nextTick();
    guessMapRef.value?.invalidateSize?.();
  }
});

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${ns}  ${Math.abs(lng).toFixed(3)}° ${ew}`;
}
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <!-- HUD -->
    <div class="mb-2">
      <StreakHud :current="streak" :best="bestStreak" :threshold="threshold" :multiplier="multiplier" :total="totalScore" />
    </div>

    <!-- Action bar — sits under the HUD so Submit is always in view -->
    <div
      v-if="state !== 'loading' && round"
      class="action-bar mb-4 border border-ink bg-paper-dark flex flex-wrap items-center justify-between gap-3 px-4 py-2"
    >
      <div
        class="font-serif italic text-ink-soft text-sm min-h-[1.25rem] flex items-center gap-2"
        :class="{ 'hidden md:flex': state === 'guessing' && !pendingGuess }"
      >
        <span class="action-bar__dot" aria-hidden="true"></span>
        <template v-if="state === 'guessing' && !pendingGuess">
          Click the chart to place your pin.
        </template>
        <template v-else-if="state === 'guessing'">
          Ready when you are.
        </template>
        <template v-else-if="state === 'revealing'">
          The trail continues…
        </template>
        <template v-else-if="state === 'gameover'">
          The journal closes. Final streak:
          <span class="font-display not-italic text-ink text-lg ml-1">{{ streak }}</span>.
        </template>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <button
          v-if="state === 'guessing' && !pendingGuess"
          type="button"
          class="btn-ink md:hidden"
          @click="mobilePane = 'chart'"
        >
          Place Pin →
        </button>
        <button
          v-if="state === 'guessing'"
          type="button"
          class="btn-ghost"
          :disabled="submitting"
          @click="loadRound"
        >
          ⇢ Skip Specimen
        </button>
        <button
          v-if="state === 'guessing'"
          type="button"
          class="btn-ink"
          :class="{ 'hidden md:inline-flex': !pendingGuess }"
          :disabled="!pendingGuess || submitting"
          @click="submitGuess"
        >
          {{ submitting ? 'Submitting…' : 'Submit Guess →' }}
        </button>
        <button
          v-if="state === 'revealing'"
          type="button"
          class="btn-ghost"
          @click="endExpedition"
        >
          ⊗ End Expedition
        </button>
        <button
          v-if="state === 'revealing'"
          type="button"
          class="btn-ink"
          @click="nextRound"
        >
          Next Specimen →
        </button>
        <template v-if="state === 'gameover'">
          <a href="/" class="btn-ghost">← Change Filters</a>
          <button
            v-if="!journalSubmitted && streak < 5"
            type="button"
            class="btn-ink"
            @click="showSubmitModal = true"
          >
            Submit to Leaderboard
          </button>
          <a
            v-if="journalSubmitted"
            href="/leaderboard"
            class="btn-ghost"
          >
            View Leaderboard
          </a>
          <button type="button" class="btn-ink" @click="playAgain">
            New Expedition →
          </button>
        </template>
      </div>
    </div>

    <!-- Loading — developing-plate expedition prep -->
    <div v-if="state === 'loading'" class="loading-stage relative" aria-busy="true" aria-live="polite">
      <!-- Skeleton that previews the eventual layout: plate + chart, stats row above -->
      <div class="grid md:grid-cols-2 gap-6 md:gap-8 loading-stage__grid" aria-hidden="true">
        <!-- Plate skeleton -->
        <section>
          <div class="flex items-baseline gap-3 mb-2">
            <span class="eyebrow">Plate</span>
            <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">№ —</span>
            <span class="flex-1 h-px bg-ink opacity-30"></span>
          </div>
          <div class="plate-frame">
            <div class="loading-panel loading-panel--photo">
              <div class="loading-panel__grain"></div>
              <div class="loading-panel__hatch"></div>
              <div class="loading-panel__sweep"></div>
            </div>
          </div>
        </section>
        <!-- Chart skeleton -->
        <section>
          <div class="flex items-baseline gap-3 mb-2">
            <span class="eyebrow">Chart</span>
            <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">Plotting coordinates</span>
            <span class="flex-1 h-px bg-ink opacity-30"></span>
          </div>
          <div class="plate-frame">
            <div class="loading-panel loading-panel--map">
              <div class="loading-panel__grain"></div>
              <div class="loading-panel__meridians"></div>
              <div class="loading-panel__sweep loading-panel__sweep--slow"></div>
            </div>
          </div>
        </section>
      </div>

      <!-- Stamped placard centered over the skeleton -->
      <div class="loading-placard" role="status">
        <div class="loading-placard__corner loading-placard__corner--tl"></div>
        <div class="loading-placard__corner loading-placard__corner--tr"></div>
        <div class="loading-placard__corner loading-placard__corner--bl"></div>
        <div class="loading-placard__corner loading-placard__corner--br"></div>

        <div class="loading-placard__eyebrow font-mono uppercase tracking-widest2">
          <span class="loading-placard__dot"></span>
          Expedition in preparation
        </div>
        <div class="loading-placard__title font-display italic">
          Preparing Field Notes<span class="loading-placard__ellipsis">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
        <div class="loading-placard__meta font-mono uppercase tracking-widest2">
          consulting archive · warming plates · unfurling charts
        </div>
        <div class="loading-placard__rule"></div>
      </div>
    </div>

    <!-- Active round -->
    <template v-else-if="round">
      <!-- Mobile pane toggle (Plate | Chart). Desktop shows both side-by-side. -->
      <div class="md:hidden mb-3 grid grid-cols-2 border border-ink pane-toggle" role="tablist">
        <button
          type="button"
          class="pane-toggle__btn"
          :class="{ 'pane-toggle__btn--active': mobilePane === 'plate' }"
          role="tab"
          :aria-selected="mobilePane === 'plate'"
          @click="mobilePane = 'plate'"
        >
          <span class="eyebrow">Plate</span>
        </button>
        <button
          type="button"
          class="pane-toggle__btn border-l border-ink"
          :class="{
            'pane-toggle__btn--active': mobilePane === 'chart',
            'pane-toggle__btn--attention': state === 'guessing' && !pendingGuess && mobilePane !== 'chart',
          }"
          role="tab"
          :aria-selected="mobilePane === 'chart'"
          @click="mobilePane = 'chart'"
        >
          <span class="eyebrow">Chart</span>
          <span
            v-if="state === 'guessing' && pendingGuess && mobilePane !== 'chart'"
            class="pane-toggle__badge font-mono"
            aria-label="Pin placed"
          >●</span>
        </button>
      </div>

      <div class="grid md:grid-cols-2 gap-6 md:gap-8 play-grid">
        <!-- Left: specimen -->
        <section :class="{ 'hidden md:block': mobilePane !== 'plate' }">
          <div class="flex items-baseline gap-3 mb-2">
            <span class="eyebrow">Plate</span>
            <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">
              № {{ String(roundIndex + 1).padStart(3, '0') }}
            </span>
            <span class="flex-1 h-px bg-ink opacity-30"></span>
          </div>
          <PhotoPanel
            :photo-urls="round.photoUrls"
            :attribution="round.attribution"
            :fig-number="roundIndex + 1"
            @zoom="(url, rect) => { lightboxUrl = url; lightboxFromRect = rect; lightboxOpen = true; }"
          />
          <div v-if="state === 'guessing'" class="mt-3">
            <HintCategories
              :round-id="round.roundId"
              :hints-used="hintsUsed"
              @wrong-answer="hintsUsed = Math.min(hintsUsed + 1, 4)"
            />
          </div>
        </section>

        <!-- Right: map -->
        <section :class="{ 'hidden md:block': mobilePane !== 'chart' }">
          <div class="flex items-baseline gap-3 mb-2">
            <span class="eyebrow eyebrow--chip">Chart</span>
            <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">
              {{ state === 'guessing' ? 'Mark your hypothesis' : 'Disclosure' }}
            </span>
            <span class="flex-1 h-px bg-ink opacity-30"></span>
          </div>

          <GuessMap
            v-if="state === 'guessing'"
            ref="guessMapRef"
            :has-guess="!!pendingGuess"
            @guess="onGuess"
          />
          <ResultMap
            v-else-if="(state === 'revealing' || state === 'gameover') && result"
            :guess="{
              lat: (pendingGuess?.lat ?? result.actualLat),
              lng: (pendingGuess?.lng ?? result.actualLng),
            }"
            :actual="{ lat: result.actualLat, lng: result.actualLng }"
          />

          <!-- Pending-guess coord strip -->
          <div
            v-if="state === 'guessing' && pendingGuess"
            class="mt-2 font-mono text-[0.7rem] uppercase tracking-widest2 text-ink-soft text-right"
          >
            Hypothesis &nbsp;·&nbsp; {{ formatCoord(pendingGuess.lat, pendingGuess.lng) }}
          </div>

          <!-- Oracle hint (under the map) -->
          <div v-if="state === 'guessing'" class="mt-3">
            <OracleHint :round-id="round.roundId" />
          </div>
        </section>
      </div>

      <!-- Result field-notes card -->
      <div v-if="result" ref="fieldNotesRef" class="mt-8 border border-ink bg-paper-dark scroll-mt-4">
        <div class="px-5 py-3 border-b border-ink flex items-baseline justify-between gap-4 flex-wrap">
          <div class="flex items-baseline gap-3">
            <span class="eyebrow">Field Notes</span>
            <span
              class="font-mono text-[0.68rem] uppercase tracking-widest2 px-2 py-0.5"
              :class="result.passed ? 'bg-moss text-paper' : 'bg-rust text-paper'"
            >
              {{ result.passed ? '✓ Within margin' : '✗ Beyond margin' }}
            </span>
          </div>
          <span class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
            {{ formatCoord(result.actualLat, result.actualLng) }}
          </span>
        </div>
        <div class="px-5 py-5 grid md:grid-cols-[1fr_auto_auto] items-baseline gap-6">
          <div>
            <div class="eyebrow mb-1">Identified as</div>
            <div class="font-display italic text-3xl md:text-4xl leading-tight" style="font-variation-settings: 'opsz' 144;">
              {{ result.taxonName }}
            </div>
            <div v-if="result.enrichment?.commonName" class="text-ink-soft text-lg mt-1">
              {{ result.enrichment.commonName }}
            </div>
            <a
              :href="result.observationUrl"
              target="_blank"
              rel="noopener"
              class="link-ink font-mono text-[0.68rem] uppercase tracking-widest2 mt-2 inline-block"
            >
              View observation ↗
            </a>
          </div>
          <div class="md:border-l md:border-ink md:pl-6">
            <div class="eyebrow mb-1">Distance</div>
            <div class="font-mono text-3xl font-medium">
              {{ result.distanceKm.toFixed(0) }}<span class="text-base text-ink-soft ml-1">km</span>
            </div>
          </div>
          <div class="md:border-l md:border-ink md:pl-6">
            <div class="eyebrow mb-1">Score</div>
            <div class="font-mono text-3xl font-medium text-rust">
              {{ result.score }}
            </div>
            <div v-if="result.hintsUsed > 0" class="font-mono text-[0.62rem] uppercase tracking-widest2 text-ink-soft mt-1">
              score reduced by hints: ×{{ result.scoreMultiplier.toFixed(2) }}
            </div>
          </div>
        </div>

        <!-- Species info section -->
        <div v-if="result.enrichment" class="px-5 py-4 border-t border-ink/30">
          <!-- Wikipedia summary -->
          <p v-if="result.enrichment.wikipediaSummary" class="font-serif text-ink-soft leading-relaxed mb-4">
            {{ result.enrichment.wikipediaSummary }}
          </p>

          <!-- Trait tags -->
          <div class="flex flex-wrap gap-2">
            <span
              v-if="result.enrichment.diet"
              class="px-2 py-1 bg-paper border border-ink/30 font-mono text-[0.65rem] uppercase tracking-widest2"
            >
              🍽 {{ result.enrichment.diet }}
            </span>
            <span
              v-if="result.enrichment.locomotion"
              class="px-2 py-1 bg-paper border border-ink/30 font-mono text-[0.65rem] uppercase tracking-widest2"
            >
              {{ result.enrichment.locomotion === 'aerial' ? '🦅' : result.enrichment.locomotion === 'aquatic' ? '🐟' : result.enrichment.locomotion === 'arboreal' ? '🌳' : result.enrichment.locomotion === 'fossorial' ? '🕳' : '🦶' }} {{ result.enrichment.locomotion }}
            </span>
            <span
              v-if="result.enrichment.iucnStatus"
              class="px-2 py-1 border font-mono text-[0.65rem] uppercase tracking-widest2"
              :class="{
                'bg-rust/10 border-rust text-rust': ['CR', 'EN'].includes(result.enrichment.iucnStatus),
                'bg-amber-100 border-amber-600 text-amber-700': ['VU', 'NT'].includes(result.enrichment.iucnStatus),
                'bg-moss/10 border-moss text-moss': result.enrichment.iucnStatus === 'LC',
                'bg-paper border-ink/30': !['CR', 'EN', 'VU', 'NT', 'LC'].includes(result.enrichment.iucnStatus),
              }"
            >
              {{ result.enrichment.iucnStatus === 'CR' ? '🔴 Critically Endangered' : result.enrichment.iucnStatus === 'EN' ? '🟠 Endangered' : result.enrichment.iucnStatus === 'VU' ? '🟡 Vulnerable' : result.enrichment.iucnStatus === 'NT' ? '🟡 Near Threatened' : result.enrichment.iucnStatus === 'LC' ? '🟢 Least Concern' : result.enrichment.iucnStatus }}
            </span>
            <span
              v-for="habitat in (result.enrichment.habitats || []).slice(0, 3)"
              :key="habitat"
              class="px-2 py-1 bg-paper border border-ink/30 font-mono text-[0.65rem] uppercase tracking-widest2"
            >
              {{ habitat === 'forest' ? '🌲' : habitat === 'grassland' ? '🌾' : habitat === 'wetland' ? '🪷' : habitat === 'desert' ? '🏜' : habitat === 'marine' ? '🌊' : habitat === 'freshwater' ? '💧' : habitat === 'urban' ? '🏙' : habitat === 'mountain' ? '⛰' : '🌍' }} {{ habitat }}
            </span>
            <span
              v-for="continent in (result.enrichment.continents || []).slice(0, 2)"
              :key="continent"
              class="px-2 py-1 bg-paper border border-ink/30 font-mono text-[0.65rem] uppercase tracking-widest2"
            >
              🗺 {{ continent.replace('_', ' ') }}
            </span>
          </div>
        </div>

        <!-- Field-notes footer: mirrors the action-bar CTAs so the next step
             is reachable without scrolling back up. -->
        <div class="px-5 py-3 border-t border-ink flex flex-wrap items-center justify-end gap-3 bg-paper">
          <template v-if="state === 'revealing'">
            <button type="button" class="btn-ghost" @click="endExpedition">
              ⊗ End Expedition
            </button>
            <button type="button" class="btn-ink" @click="nextRound">
              Next Specimen →
            </button>
          </template>
          <template v-else-if="state === 'gameover'">
            <a href="/" class="btn-ghost">← Change Filters</a>
            <button
              v-if="!journalSubmitted && streak < 5"
              type="button"
              class="btn-ghost"
              @click="showSubmitModal = true"
            >
              Submit to Leaderboard
            </button>
            <a v-if="journalSubmitted" href="/leaderboard" class="btn-ghost">
              View Leaderboard
            </a>
            <button type="button" class="btn-ink" @click="playAgain">
              New Expedition →
            </button>
          </template>
        </div>
      </div>

      <div v-if="errorMsg" class="mt-6 border border-rust text-rust px-4 py-2 font-mono text-xs uppercase tracking-widest2">
        ⚠ {{ errorMsg }}
      </div>

      <!-- Auto-submit toast -->
      <div
        v-if="autoSubmitting || autoSubmitName"
        class="mt-4 border px-4 py-2 font-mono text-xs uppercase tracking-widest2"
        :class="autoSubmitting ? 'border-ink/50 text-ink-soft' : 'border-moss text-moss'"
      >
        <template v-if="autoSubmitting">
          Recording expedition…
        </template>
        <template v-else-if="autoSubmitName">
          Expedition recorded as {{ autoSubmitName }}!
          <a href="/leaderboard" class="underline ml-2">View leaderboard →</a>
        </template>
      </div>
    </template>
    <PhotoLightbox
      :open="lightboxOpen"
      :url="lightboxUrl"
      :from-rect="lightboxFromRect"
      :caption="'Fig. ' + String(roundIndex + 1).padStart(2, '0')"
      @close="lightboxOpen = false"
    />
    <SubmitJournalModal
      :open="showSubmitModal"
      :streak="expeditionBestStreak"
      :total-score="totalScore"
      :filter-hash="filterHash"
      :filter-label="expeditionRounds.length > 0 ? `Expedition` : 'All · World'"
      :rounds="roundsForSubmit"
      @close="showSubmitModal = false"
      @submitted="onJournalSubmitted"
    />
  </div>
</template>

<style scoped>
/* ── Sticky action bar, just beneath the stats row ──────────────────── */
.action-bar {
  /* subtle woven paper texture reminiscent of the plate-overlay */
  background-image:
    repeating-linear-gradient(
      45deg,
      rgba(26, 46, 36, 0.04) 0 1px,
      transparent 1px 8px
    );
  box-shadow: 2px 2px 0 var(--ink);
}

.action-bar__dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  background: var(--rust);
  border-radius: 50%;
  opacity: 0.75;
  animation: action-dot 2000ms ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes action-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1.1);  }
}

/* ── Loading stage: empty plates under a stamped placard ─────────────── */
.loading-stage {
  min-height: 60vh;
}

.loading-stage__grid {
  opacity: 0.85;
}

.loading-panel {
  position: relative;
  height: 58vh;
  min-height: 420px;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(237, 220, 190, 0.95),
    rgba(196, 160, 112, 0.9) 50%,
    rgba(154, 118, 78, 0.92)
  );
}

.loading-panel--map {
  background: linear-gradient(
    145deg,
    rgba(230, 217, 184, 0.95),
    rgba(200, 178, 132, 0.9) 55%,
    rgba(170, 140, 90, 0.92)
  );
}

.loading-panel__grain {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(60, 40, 20, 0.28) 0.7px, transparent 0.8px);
  background-size: 3px 3px;
  mix-blend-mode: multiply;
  opacity: 0.55;
}

.loading-panel__hatch {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(60, 40, 20, 0.18) 0 1px,
      transparent 1px 7px
    ),
    repeating-linear-gradient(
      -45deg,
      rgba(60, 40, 20, 0.1) 0 1px,
      transparent 1px 9px
    );
  mix-blend-mode: multiply;
}

/* Map skeleton: faux meridians / parallels instead of hatched engraving */
.loading-panel__meridians {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      to right,
      rgba(26, 46, 36, 0.14) 0 1px,
      transparent 1px 56px
    ),
    repeating-linear-gradient(
      to bottom,
      rgba(26, 46, 36, 0.14) 0 1px,
      transparent 1px 56px
    );
  mix-blend-mode: multiply;
  mask-image: radial-gradient(ellipse at center, black 45%, transparent 85%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 45%, transparent 85%);
}

.loading-panel__sweep {
  position: absolute;
  inset: -20% -40%;
  background: linear-gradient(
    100deg,
    transparent 42%,
    rgba(255, 245, 220, 0.35) 50%,
    transparent 58%
  );
  animation: loading-sweep 2600ms ease-in-out infinite;
  mix-blend-mode: screen;
}

.loading-panel__sweep--slow {
  animation-duration: 3400ms;
  animation-delay: 600ms;
}

@keyframes loading-sweep {
  0%   { transform: translateX(-40%); }
  100% { transform: translateX(40%);  }
}

/* Stamped placard — the loud, letterpressed "preparing…" sign */
.loading-placard {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: min(520px, 86%);
  padding: 1.75rem 2rem 1.5rem;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  box-shadow:
    4px 4px 0 var(--ink),
    inset 0 0 0 1px var(--paper),
    inset 0 0 0 2px var(--ink);
  text-align: center;
  animation: placard-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
  z-index: 2;
}

/* Hatched wash behind the placard text — ties it to the photo reveal */
.loading-placard::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(26, 46, 36, 0.06) 0 1px,
      transparent 1px 6px
    );
  pointer-events: none;
  mix-blend-mode: multiply;
}

/* Engraver's corner brackets */
.loading-placard__corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: var(--ink);
  border-style: solid;
  border-width: 0;
}
.loading-placard__corner--tl { top: 6px; left: 6px; border-top-width: 1.5px; border-left-width: 1.5px; }
.loading-placard__corner--tr { top: 6px; right: 6px; border-top-width: 1.5px; border-right-width: 1.5px; }
.loading-placard__corner--bl { bottom: 6px; left: 6px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
.loading-placard__corner--br { bottom: 6px; right: 6px; border-bottom-width: 1.5px; border-right-width: 1.5px; }

.loading-placard__eyebrow {
  position: relative;
  font-size: 0.62rem;
  color: var(--ink-soft);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.loading-placard__dot {
  display: inline-block;
  width: 0.42rem;
  height: 0.42rem;
  background: var(--rust);
  border-radius: 50%;
  animation: placard-pulse 1400ms ease-in-out infinite;
}

@keyframes placard-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50%      { opacity: 1;    transform: scale(1.15); }
}

.loading-placard__title {
  position: relative;
  font-size: clamp(1.75rem, 3.2vw, 2.5rem);
  line-height: 1.1;
  font-variation-settings: 'opsz' 144;
  margin: 0.1rem 0 0.75rem;
}

.loading-placard__ellipsis {
  display: inline-block;
  margin-left: 0.1em;
}

.loading-placard__ellipsis span {
  display: inline-block;
  animation: placard-ellipsis 1400ms ease-in-out infinite;
}
.loading-placard__ellipsis span:nth-child(2) { animation-delay: 180ms; }
.loading-placard__ellipsis span:nth-child(3) { animation-delay: 360ms; }

@keyframes placard-ellipsis {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 1;   }
}

.loading-placard__meta {
  position: relative;
  font-size: 0.6rem;
  color: var(--ink-soft);
  letter-spacing: 0.24em;
}

.loading-placard__rule {
  position: relative;
  height: 1px;
  width: 48px;
  margin: 0.85rem auto 0;
  background: var(--ink);
  opacity: 0.55;
}

@keyframes placard-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 10px)); }
  to   { opacity: 1; transform: translate(-50%, -50%);              }
}

@media (prefers-reduced-motion: reduce) {
  .loading-panel__sweep,
  .loading-placard__dot,
  .loading-placard__ellipsis span,
  .action-bar__dot {
    animation: none;
  }
  .loading-placard {
    animation-duration: 200ms;
  }
}

/* Mobile Plate/Chart segmented toggle */
.pane-toggle {
  background: rgb(var(--paper-dark-rgb, 244 232 206) / 0.35);
}
.pane-toggle__btn {
  position: relative;
  padding: 0.55rem 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  transition: background 150ms ease, color 150ms ease;
}
.pane-toggle__btn--active {
  background: theme('colors.ink');
  color: theme('colors.paper');
}
.pane-toggle__btn--active .eyebrow {
  color: inherit;
}
.pane-toggle__btn--attention::after {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1px dashed theme('colors.rust');
  pointer-events: none;
  animation: pane-attention 1400ms ease-in-out infinite;
}
@keyframes pane-attention {
  0%, 100% { opacity: 0.3; }
  50%      { opacity: 0.9; }
}
.pane-toggle__badge {
  color: theme('colors.rust');
  font-size: 0.6rem;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .pane-toggle__btn--attention::after {
    animation: none;
  }
}
</style>
