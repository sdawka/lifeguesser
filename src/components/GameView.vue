<script setup lang="ts">
import { ref, computed, onMounted, useTemplateRef } from 'vue';
import type { Filters, RoundPayload, GuessResult } from '../types';
import { hashFiltersSync, TAXON_PRESETS, PLACE_PRESETS } from '../lib/filters';
import {
  getBestStreak,
  setBestStreak,
  appendGameRecord,
  type GameRecord,
  type GameRoundRecord,
} from '../lib/storage';
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
const pendingGuess = ref<{ lat: number; lng: number } | null>(null);
const result = ref<GuessResult | null>(null);
const roundIndex = ref(0);
const streak = ref(0);
const bestStreak = ref(0);
const errorMsg = ref<string | null>(null);
const submitting = ref(false);
const hintsUsed = ref(0);
const multiplier = computed(() => [1, 0.8, 0.6, 0.4, 0.2][hintsUsed.value] ?? 1);
const lightboxOpen = ref(false);
const lightboxUrl = ref('');
const expeditionRounds = ref<GameRoundRecord[]>([]);
const historySaved = ref(false);
const showSubmitModal = ref(false);
const journalSubmitted = ref(false);
const submittedRank = ref<{ streak: number; totalScore: number } | null>(null);

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

async function loadRound() {
  state.value = 'loading';
  errorMsg.value = null;
  result.value = null;
  pendingGuess.value = null;
  hintsUsed.value = 0;
  try {
    const params = new URLSearchParams();
    if (props.filters.taxonId != null) params.set('taxon', String(props.filters.taxonId));
    if (props.filters.placeId != null) params.set('place', String(props.filters.placeId));
    const qs = params.toString();
    const res = await fetch('/api/round' + (qs ? '?' + qs : ''));
    if (!res.ok) throw new Error('Failed to load observation');
    round.value = (await res.json()) as RoundPayload;
    state.value = 'guessing';
    guessMapRef.value?.reset?.();
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to load observation';
    state.value = 'guessing';
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
    expeditionRounds.value.push({
      distanceKm: r.distanceKm,
      score: r.score,
      hintsUsed: r.hintsUsed,
      passed: r.passed,
      taxonName: r.taxonName,
    });
    if (r.passed) {
      streak.value += 1;
      if (streak.value > bestStreak.value) {
        bestStreak.value = streak.value;
        setBestStreak(filterHash.value, bestStreak.value);
      }
      state.value = 'revealing';
    } else {
      if (streak.value > bestStreak.value) bestStreak.value = streak.value;
      setBestStreak(filterHash.value, bestStreak.value);
      state.value = 'gameover';
      saveHistory();
    }
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

function saveHistory() {
  if (historySaved.value || !expeditionRounds.value.length) return;
  const taxonLabel =
    TAXON_PRESETS.find((p) => p.taxonId === props.filters.taxonId)?.label ?? 'Any';
  const placeLabel =
    PLACE_PRESETS.find((p) => p.placeId === props.filters.placeId)?.label ?? 'World';
  const rec: GameRecord = {
    at: Date.now(),
    filterHash: filterHash.value,
    filterLabel: `${taxonLabel} · ${placeLabel}`,
    finalStreak: streak.value,
    rounds: expeditionRounds.value.slice(),
  };
  appendGameRecord(rec);
  historySaved.value = true;
}

function onJournalSubmitted(response: SubmitJournalResponse) {
  journalSubmitted.value = true;
  submittedRank.value = response.rank;
}

function playAgain() {
  streak.value = 0;
  roundIndex.value = 0;
  expeditionRounds.value = [];
  historySaved.value = false;
  journalSubmitted.value = false;
  submittedRank.value = null;
  showSubmitModal.value = false;
  loadRound();
}

onMounted(() => {
  bestStreak.value = getBestStreak(filterHash.value) ?? 0;
  loadRound();
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
    <div class="mb-6">
      <StreakHud :current="streak" :best="bestStreak" :threshold="threshold" :multiplier="multiplier" />
    </div>

    <!-- Loading -->
    <div v-if="state === 'loading'" class="text-center py-24">
      <div class="eyebrow mb-3">Consulting the archive</div>
      <div class="font-display italic text-3xl">Fetching specimen…</div>
      <div class="inline-block mt-6">
        <div class="hairline w-24"></div>
      </div>
    </div>

    <!-- Active round -->
    <template v-else-if="round">
      <div class="grid md:grid-cols-2 gap-6 md:gap-8">
        <!-- Left: specimen -->
        <section>
          <div class="flex items-baseline gap-3 mb-3">
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
            @zoom="(url) => { lightboxUrl = url; lightboxOpen = true; }"
          />
          <div v-if="state === 'guessing'" class="mt-4">
            <HintCategories
              :round-id="round.roundId"
              :hints-used="hintsUsed"
              @wrong-answer="hintsUsed = Math.min(hintsUsed + 1, 4)"
            />
          </div>
        </section>

        <!-- Right: map -->
        <section>
          <div class="flex items-baseline gap-3 mb-3">
            <span class="eyebrow">Chart</span>
            <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">
              {{ state === 'guessing' ? 'Mark your hypothesis' : 'Disclosure' }}
            </span>
            <span class="flex-1 h-px bg-ink opacity-30"></span>
          </div>

          <GuessMap
            v-if="state === 'guessing'"
            ref="guessMapRef"
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
          <div v-if="state === 'guessing'" class="mt-4">
            <OracleHint :round-id="round.roundId" />
          </div>
        </section>
      </div>

      <!-- Result field-notes card -->
      <div v-if="result" class="mt-8 border border-ink bg-paper-dark">
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
      </div>

      <!-- Actions -->
      <div class="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div class="font-serif italic text-ink-soft">
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
            The journal closes. Final streak: <span class="font-display text-xl not-italic">{{ streak }}</span>.
          </template>
        </div>

        <div class="flex gap-3">
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
            :disabled="!pendingGuess || submitting"
            @click="submitGuess"
          >
            {{ submitting ? 'Submitting…' : 'Submit Guess →' }}
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
              v-if="!journalSubmitted"
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

      <div v-if="errorMsg" class="mt-4 border border-rust text-rust px-4 py-2 font-mono text-xs uppercase tracking-widest2">
        ⚠ {{ errorMsg }}
      </div>
    </template>
    <PhotoLightbox
      :open="lightboxOpen"
      :url="lightboxUrl"
      :caption="'Fig. ' + String(roundIndex + 1).padStart(2, '0')"
      @close="lightboxOpen = false"
    />
    <SubmitJournalModal
      :open="showSubmitModal"
      :streak="streak"
      :total-score="totalScore"
      :filter-hash="filterHash"
      :filter-label="expeditionRounds.length > 0 ? `Expedition` : 'All · World'"
      :rounds="roundsForSubmit"
      @close="showSubmitModal = false"
      @submitted="onJournalSubmitted"
    />
  </div>
</template>
