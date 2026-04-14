<!-- src/components/SubmitJournalModal.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  getUserId,
  getUserName,
  setUserId,
  setUserName,
  generateUserId,
} from '../lib/user-storage';
import type { SubmitJournalResponse, SightingInput } from '../lib/leaderboard-types';

const props = defineProps<{
  open: boolean;
  streak: number;
  totalScore: number;
  filterHash: string;
  filterLabel: string;
  rounds: SightingInput[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submitted', response: SubmitJournalResponse): void;
}>();

const step = ref<'nickname' | 'submitting' | 'done'>('nickname');
const nickname = ref(getUserName() ?? '');
const error = ref<string | null>(null);
const result = ref<SubmitJournalResponse | null>(null);

const hasExistingUser = computed(() => !!getUserId() && !!getUserName());

async function submit() {
  error.value = null;

  let userId = getUserId();
  const name = nickname.value.trim();

  if (!name) {
    error.value = 'Please enter a nickname';
    return;
  }

  step.value = 'submitting';

  try {
    // If no userId, generate one and register
    if (!userId) {
      userId = generateUserId();
      setUserId(userId);
    }

    // Register or update user
    const regRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname: name }),
    });

    if (!regRes.ok) {
      const data = await regRes.json();
      throw new Error(data.error ?? 'Registration failed');
    }

    setUserName(name);

    // Submit journal
    const journalId = crypto.randomUUID();
    const journalRes = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        journalId,
        userId,
        streak: props.streak,
        totalScore: props.totalScore,
        filterHash: props.filterHash,
        filterLabel: props.filterLabel,
        rounds: props.rounds,
      }),
    });

    if (!journalRes.ok) {
      const data = await journalRes.json();
      throw new Error(data.error ?? 'Submission failed');
    }

    result.value = await journalRes.json();
    step.value = 'done';
    emit('submitted', result.value!);
  } catch (err: any) {
    error.value = err?.message ?? 'Something went wrong';
    step.value = 'nickname';
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-ink/50 flex items-center justify-center z-50"
    @click.self="emit('close')"
  >
    <div class="bg-paper border border-ink p-6 max-w-sm w-full mx-4">
      <!-- Nickname step -->
      <template v-if="step === 'nickname'">
        <h3 class="font-display italic text-xl mb-2">Submit to Hall of Naturalists</h3>
        <p class="text-sm text-ink-soft mb-4">
          Record your expedition for posterity.
        </p>

        <div class="border border-ink/30 px-4 py-3 mb-4 bg-paper-dark">
          <div class="flex justify-between text-sm">
            <span>Streak</span>
            <span class="font-mono font-medium">{{ streak }}</span>
          </div>
          <div class="flex justify-between text-sm mt-1">
            <span>Total Score</span>
            <span class="font-mono font-medium">{{ totalScore.toLocaleString() }}</span>
          </div>
        </div>

        <form @submit.prevent="submit">
          <label class="block text-xs uppercase tracking-widest2 text-ink-soft mb-1">
            Your name for the record
          </label>
          <input
            v-model="nickname"
            type="text"
            placeholder="Intrepid Explorer"
            maxlength="30"
            class="w-full border border-ink px-3 py-2 mb-3 bg-paper"
            :disabled="hasExistingUser"
          />
          <div v-if="hasExistingUser" class="text-xs text-ink-soft mb-3">
            Submitting as {{ getUserName() }}
          </div>
          <div v-if="error" class="text-rust text-sm mb-3">{{ error }}</div>
          <div class="flex gap-3">
            <button type="button" class="btn-ghost flex-1" @click="emit('close')">
              Skip
            </button>
            <button type="submit" class="btn-ink flex-1">
              Submit →
            </button>
          </div>
        </form>
      </template>

      <!-- Submitting -->
      <template v-else-if="step === 'submitting'">
        <div class="text-center py-8">
          <div class="font-display italic text-xl">Recording expedition…</div>
        </div>
      </template>

      <!-- Done -->
      <template v-else-if="step === 'done' && result">
        <h3 class="font-display italic text-xl mb-4 text-moss">Expedition Recorded!</h3>

        <div class="border border-ink/30 px-4 py-3 mb-4 bg-paper-dark">
          <div class="flex justify-between text-sm">
            <span>Streak Rank</span>
            <span class="font-mono font-medium">#{{ result.rank.streak }}</span>
          </div>
          <div class="flex justify-between text-sm mt-1">
            <span>Score Rank</span>
            <span class="font-mono font-medium">#{{ result.rank.totalScore }}</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button class="btn-ghost flex-1" @click="emit('close')">
            Close
          </button>
          <a href="/leaderboard" class="btn-ink flex-1 text-center">
            View Leaderboard →
          </a>
        </div>
      </template>
    </div>
  </div>
</template>
