<script setup lang="ts">
withDefaults(
  defineProps<{
    current: number;
    best: number;
    threshold: number;
    multiplier?: number;
  }>(),
  { multiplier: 1 }
);
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 border border-ink">
    <div class="px-4 py-3 border-r border-ink border-b md:border-b-0 flex flex-col items-start">
      <div class="eyebrow">Streak</div>
      <div class="font-display text-4xl md:text-5xl leading-none mt-1" style="font-variation-settings: 'opsz' 144;">
        {{ current }}
      </div>
    </div>
    <div class="px-4 py-3 md:border-r border-ink border-b md:border-b-0 flex flex-col items-start">
      <div class="eyebrow">Personal Best</div>
      <div class="font-display text-4xl md:text-5xl leading-none mt-1 italic" style="font-variation-settings: 'opsz' 144;">
        {{ best }}
      </div>
    </div>
    <div class="px-4 py-3 border-r border-ink flex flex-col items-start">
      <div class="eyebrow">Margin</div>
      <div class="font-mono text-2xl md:text-3xl font-medium leading-none mt-2 text-rust">
        ≤ {{ threshold }}<span class="text-sm ml-1 text-ink-soft">km</span>
      </div>
    </div>
    <div class="px-4 py-3 flex flex-col items-start">
      <div class="eyebrow">Score ×</div>
      <div
        class="font-mono text-2xl md:text-3xl font-medium leading-none mt-2"
        :class="multiplier < 1 ? 'text-rust' : 'text-ink'"
      >
        ×{{ multiplier.toFixed(2) }}
      </div>
    </div>
  </div>
</template>
