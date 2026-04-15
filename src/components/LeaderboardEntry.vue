<script setup lang="ts">
import type { LeaderboardEntry, LeaderboardType } from '../lib/leaderboard-types';

const props = defineProps<{
  entry: LeaderboardEntry;
  type: LeaderboardType;
  isCurrentUser?: boolean;
}>();

const medals = ['', '1st', '2nd', '3rd'] as const;

function formatValue(value: number, type: LeaderboardType): string {
  if (type === 'streak') {
    return `${value} ${value === 1 ? 'round' : 'rounds'}`;
  }
  return value.toLocaleString();
}
</script>

<template>
  <div
    class="flex items-center gap-4 px-4 py-3 border-b border-ink/20"
    :class="{ 'bg-moss/10': isCurrentUser }"
  >
    <!-- Rank -->
    <div class="w-12 text-center">
      <span
        v-if="entry.rank <= 3"
        class="font-display text-xl"
        :class="{
          'text-amber-500': entry.rank === 1,
          'text-slate-400': entry.rank === 2,
          'text-amber-700': entry.rank === 3,
        }"
      >
        {{ medals[entry.rank] }}
      </span>
      <span v-else class="font-mono text-ink-soft">#{{ entry.rank }}</span>
    </div>

    <!-- Name + Verified -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium truncate">{{ entry.displayName }}</span>
        <span v-if="isCurrentUser" class="text-moss text-sm font-medium">(You)</span>
        <span v-if="entry.verified" class="text-moss text-sm" title="Verified">&#10003;</span>
      </div>
      <div class="text-xs text-ink-soft truncate">{{ entry.filterLabel }}</div>
    </div>

    <!-- Value -->
    <div class="text-right">
      <div class="font-mono text-lg font-medium">{{ formatValue(entry.value, type) }}</div>
      <div class="text-xs text-ink-soft uppercase tracking-wide">
        {{ type === 'streak' ? 'streak' : 'score' }}
      </div>
    </div>
  </div>
</template>
