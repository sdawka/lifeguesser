<script setup lang="ts">
import { ref, watch, computed, onMounted, nextTick } from 'vue';
import type { HintCategory } from '../lib/hints/categories';

const props = defineProps<{
  roundId: string;
  hintsUsed: number;
}>();

const emit = defineEmits<{
  (e: 'wrong-answer'): void;
}>();

type Phase = 'loading' | 'pending-enrichment' | 'menu' | 'question' | 'answered' | 'error';

type RevealSource = 'inat' | 'eol' | 'wikidata' | 'wikipedia';
type RevealPayload = { value: unknown; source: RevealSource };

const phase = ref<Phase>('loading');
const categories = ref<HintCategory[]>([]);
const usedCategories = ref<Set<HintCategory>>(new Set());
const errorMsg = ref<string | null>(null);
const sectionEl = ref<HTMLElement | null>(null);

// When a hint expands (question or answered view), the new content can land
// below the fold. Pull the whole card into view — block:'nearest' only
// scrolls if it needs to.
watch(phase, async (p) => {
  if (p !== 'question' && p !== 'answered') return;
  await nextTick();
  sectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

const activeCategory = ref<HintCategory | null>(null);
const activeQuestion = ref<string | null>(null);
const activeChoices = ref<string[]>([]);
const submittingChoice = ref(false);

const answerCorrect = ref<boolean | null>(null);
const answerReveal = ref<RevealPayload | null>(null);

let retryCount = 0;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;

const availableCategories = computed(() =>
  categories.value.filter((c) => !usedCategories.value.has(c))
);

function labelFor(c: HintCategory): string {
  switch (c) {
    case 'diet': return 'Diet';
    case 'habitat': return 'Habitat';
    case 'continent': return 'Range';
    case 'conservation': return 'Status';
    case 'taxonomy-class': return 'Class';
    case 'taxonomy-order': return 'Order';
  }
}

function symbolFor(c: HintCategory): string {
  switch (c) {
    case 'diet': return '∴';
    case 'habitat': return '≋';
    case 'continent': return '◉';
    case 'conservation': return '§';
    case 'taxonomy-class':
    case 'taxonomy-order': return '◊';
  }
}

const IUCN_LABELS: Record<string, string> = {
  LC: 'Least Concern',
  NT: 'Near Threatened',
  VU: 'Vulnerable',
  EN: 'Endangered',
  CR: 'Critically Endangered',
  EW: 'Extinct in the Wild',
  EX: 'Extinct',
  DD: 'Data Deficient',
};

const SOURCE_LABELS: Record<RevealSource, string> = {
  inat: 'From iNaturalist',
  eol: 'From Encyclopedia of Life',
  wikidata: 'From Wikidata',
  wikipedia: 'From Wikipedia',
};

function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatReveal(category: HintCategory, value: unknown): string {
  if (category === 'conservation') {
    if (typeof value === 'string') return IUCN_LABELS[value] ?? value;
    return String(value ?? '—');
  }
  if (category === 'diet') {
    return typeof value === 'string' ? titleCase(value) : String(value ?? '—');
  }
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? titleCase(v) : String(v))).join(', ');
  }
  if (typeof value === 'string') return titleCase(value);
  return String(value ?? '—');
}

function choiceLabel(i: number): string {
  return String.fromCharCode(65 + i);
}

async function loadCategories() {
  phase.value = 'loading';
  errorMsg.value = null;
  try {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: props.roundId }),
    });
    if (!res.ok) throw new Error('Failed to fetch hint categories');
    const data = (await res.json()) as
      | { status: 'pending'; categories: [] }
      | { status: 'ready'; categories: HintCategory[] };
    if (data.status === 'pending') {
      if (retryCount >= MAX_RETRIES) {
        phase.value = 'pending-enrichment';
        return;
      }
      retryCount += 1;
      phase.value = 'pending-enrichment';
      setTimeout(() => {
        if (phase.value === 'pending-enrichment') loadCategories();
      }, RETRY_DELAY_MS);
      return;
    }
    categories.value = data.categories ?? [];
    phase.value = 'menu';
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to load hint categories';
    phase.value = 'error';
  }
}

function retryEnrichment() {
  retryCount = 0;
  loadCategories();
}

async function pickCategory(category: HintCategory) {
  activeCategory.value = category;
  activeQuestion.value = null;
  activeChoices.value = [];
  phase.value = 'question';
  try {
    const res = await fetch('/api/hint/question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: props.roundId, category }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Failed to fetch question');
    }
    const data = (await res.json()) as { question: string; choices: string[] };
    activeQuestion.value = data.question;
    activeChoices.value = data.choices;
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to fetch question';
    phase.value = 'menu';
  }
}

async function pickChoice(index: number) {
  if (!activeCategory.value || submittingChoice.value) return;
  submittingChoice.value = true;
  try {
    const res = await fetch('/api/hint/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roundId: props.roundId,
        category: activeCategory.value,
        choiceIndex: index,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Failed to submit answer');
    }
    const data = (await res.json()) as { correct: boolean; reveal: RevealPayload };
    answerCorrect.value = data.correct;
    answerReveal.value = data.reveal;
    if (activeCategory.value) usedCategories.value.add(activeCategory.value);
    if (!data.correct) emit('wrong-answer');
    phase.value = 'answered';
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to submit answer';
  } finally {
    submittingChoice.value = false;
  }
}

function backToMenu() {
  activeCategory.value = null;
  activeQuestion.value = null;
  activeChoices.value = [];
  answerCorrect.value = null;
  answerReveal.value = null;
  phase.value = 'menu';
}

watch(
  () => props.roundId,
  () => {
    retryCount = 0;
    categories.value = [];
    usedCategories.value = new Set();
    activeCategory.value = null;
    activeQuestion.value = null;
    activeChoices.value = [];
    answerCorrect.value = null;
    answerReveal.value = null;
    errorMsg.value = null;
    loadCategories();
  }
);

onMounted(() => {
  loadCategories();
});
</script>

<template>
  <section ref="sectionEl" class="border border-ink bg-paper-dark scroll-mt-4">
    <div class="px-4 py-2 border-b border-ink flex items-baseline justify-between gap-3">
      <div class="eyebrow">Consult Field Guide</div>
      <div class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
        Correct = free · wrong = −20%
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="phase === 'loading'"
      class="px-4 py-6 font-serif italic text-ink-soft"
    >
      Leafing through the field guide…
    </div>

    <!-- Pending enrichment -->
    <div
      v-else-if="phase === 'pending-enrichment'"
      class="px-4 py-6"
    >
      <p class="font-serif italic text-ink-soft mb-3">
        Field notes still being transcribed…
      </p>
      <button type="button" class="btn-ghost" @click="retryEnrichment">
        ↻ Try again
      </button>
    </div>

    <!-- Error -->
    <div
      v-else-if="phase === 'error'"
      class="px-4 py-4"
    >
      <p class="font-mono text-xs uppercase tracking-widest2 text-rust mb-3">
        ⚠ {{ errorMsg }}
      </p>
      <button type="button" class="btn-ghost" @click="retryEnrichment">
        ↻ Retry
      </button>
    </div>

    <!-- Menu — compact chip row so it doesn't dominate the plate pane -->
    <div v-else-if="phase === 'menu'" class="px-3 py-2">
      <div v-if="availableCategories.length === 0" class="font-serif italic text-ink-soft text-sm">
        No further entries in the field guide for this specimen.
      </div>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
          v-for="c in availableCategories"
          :key="c"
          type="button"
          class="border border-ink bg-paper hover:bg-paper-dark px-2.5 py-1.5 inline-flex items-center gap-2 text-left transition-colors"
          @click="pickCategory(c)"
        >
          <span class="font-display text-lg text-rust leading-none">{{ symbolFor(c) }}</span>
          <span class="font-mono text-[0.66rem] uppercase tracking-widest2">{{ labelFor(c) }}</span>
        </button>
      </div>
    </div>

    <!-- Question -->
    <div v-else-if="phase === 'question'" class="px-4 py-4">
      <div class="flex items-baseline gap-2 mb-3">
        <span class="font-display text-xl text-rust">{{ activeCategory ? symbolFor(activeCategory) : '' }}</span>
        <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">
          {{ activeCategory ? labelFor(activeCategory) : '' }}
        </span>
      </div>
      <p
        v-if="activeQuestion"
        class="font-display italic text-xl leading-snug mb-4"
        style="font-variation-settings: 'opsz' 72;"
      >
        {{ activeQuestion }}
      </p>
      <p v-else class="font-serif italic text-ink-soft mb-4">
        Drafting question…
      </p>
      <div v-if="activeChoices.length" class="flex flex-col gap-2">
        <button
          v-for="(choice, i) in activeChoices"
          :key="i"
          type="button"
          class="border border-ink bg-paper hover:bg-paper-dark px-3 py-2 flex items-center gap-3 text-left transition-colors disabled:opacity-50"
          :disabled="submittingChoice"
          @click="pickChoice(i)"
        >
          <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft w-5">
            {{ choiceLabel(i) }}
          </span>
          <span class="font-serif text-base">{{ choice }}</span>
        </button>
      </div>
    </div>

    <!-- Answered -->
    <div v-else-if="phase === 'answered'" class="px-4 py-4">
      <div
        class="font-mono text-[0.7rem] uppercase tracking-widest2 mb-3"
        :class="answerCorrect ? 'text-moss' : 'text-rust'"
      >
        {{ answerCorrect ? '✓ Correct · hint is free' : '✗ Incorrect · −20% score' }}
      </div>
      <div class="eyebrow mb-1">
        {{ activeCategory ? labelFor(activeCategory) : '' }}
      </div>
      <div
        class="font-display italic text-2xl leading-tight mb-2"
        style="font-variation-settings: 'opsz' 72;"
      >
        {{ answerReveal && activeCategory ? formatReveal(activeCategory, answerReveal.value) : '—' }}
      </div>
      <div
        v-if="answerReveal"
        class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft mb-4"
      >
        {{ SOURCE_LABELS[answerReveal.source] ?? answerReveal.source }}
      </div>
      <button type="button" class="btn-ghost" @click="backToMenu">
        ← Back to field guide
      </button>
    </div>

    <div
      v-if="errorMsg && phase !== 'error'"
      class="px-4 py-2 border-t border-rust text-rust font-mono text-xs uppercase tracking-widest2"
    >
      ⚠ {{ errorMsg }}
    </div>
  </section>
</template>
