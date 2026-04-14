<!-- src/components/LeaderboardView.vue -->
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { getUserId } from '../lib/user-storage';
import type {
  LeaderboardResponse,
  LeaderboardType,
  LeaderboardWindow,
} from '../lib/leaderboard-types';
import LeaderboardEntry from './LeaderboardEntry.vue';

const type = ref<LeaderboardType>('streak');
const window = ref<LeaderboardWindow>('allTime');
const data = ref<LeaderboardResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function fetchLeaderboard() {
  loading.value = true;
  error.value = null;
  try {
    const userId = getUserId();
    const params = new URLSearchParams({
      type: type.value,
      window: window.value,
    });
    if (userId) params.set('userId', userId);

    const res = await fetch(`/api/leaderboard?${params}`);
    if (!res.ok) throw new Error('Failed to fetch leaderboard');
    data.value = await res.json();
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to load leaderboard';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchLeaderboard);
watch([type, window], fetchLeaderboard);
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Header -->
    <div class="flex items-baseline gap-3 mb-6">
      <span class="eyebrow">Hall of Naturalists</span>
      <span class="flex-1 h-px bg-ink opacity-30"></span>
    </div>

    <!-- Tabs -->
    <div class="flex gap-6 mb-6 border-b border-ink/20">
      <button
        class="pb-2 font-mono text-sm uppercase tracking-widest2 transition-colors"
        :class="type === 'streak' ? 'text-ink border-b-2 border-moss' : 'text-ink-soft hover:text-ink'"
        @click="type = 'streak'"
      >
        Streak
      </button>
      <button
        class="pb-2 font-mono text-sm uppercase tracking-widest2 transition-colors"
        :class="type === 'totalScore' ? 'text-ink border-b-2 border-moss' : 'text-ink-soft hover:text-ink'"
        @click="type = 'totalScore'"
      >
        Total Score
      </button>

      <div class="flex-1"></div>

      <button
        class="pb-2 font-mono text-xs uppercase tracking-widest2 transition-colors"
        :class="window === 'allTime' ? 'text-ink' : 'text-ink-soft hover:text-ink'"
        @click="window = 'allTime'"
      >
        All-Time
      </button>
      <button
        class="pb-2 font-mono text-xs uppercase tracking-widest2 transition-colors"
        :class="window === 'daily' ? 'text-ink' : 'text-ink-soft hover:text-ink'"
        @click="window = 'daily'"
      >
        Today
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="font-display italic text-xl text-ink-soft">Loading records…</div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="border border-rust text-rust px-4 py-3 text-sm">
      {{ error }}
    </div>

    <!-- Empty -->
    <div v-else-if="!data?.entries.length" class="text-center py-12">
      <div class="font-display italic text-xl text-ink-soft">No expeditions recorded yet</div>
      <a href="/play" class="btn-ink mt-4 inline-block">Start an Expedition</a>
    </div>

    <!-- Entries -->
    <div v-else class="border border-ink bg-paper-dark">
      <LeaderboardEntry
        v-for="entry in data.entries"
        :key="entry.rank"
        :entry="entry"
        :type="type"
        :is-current-user="false"
      />

      <!-- User's rank (if not in top 10) -->
      <div
        v-if="data.userRank && data.userRank > 10 && data.userValue != null"
        class="border-t border-ink"
      >
        <div class="px-4 py-2 text-xs text-ink-soft uppercase tracking-widest2 bg-paper">
          Your position
        </div>
        <LeaderboardEntry
          :entry="{
            rank: data.userRank,
            displayName: 'You',
            value: data.userValue,
            filterLabel: '',
            verified: false,
          }"
          :type="type"
          :is-current-user="true"
        />
      </div>
    </div>

    <!-- CTA -->
    <div class="mt-8 text-center">
      <a href="/play" class="btn-ghost">← Back to Expedition</a>
    </div>
  </div>
</template>
