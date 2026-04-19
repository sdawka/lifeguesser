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
    <div class="px-3 py-2 border-r border-ink border-b md:border-b-0 flex flex-col items-start">
      <div class="eyebrow text-[0.6rem]">Streak</div>
      <div class="font-display text-2xl md:text-3xl leading-none mt-1" style="font-variation-settings: 'opsz' 144;">
        {{ current }}
      </div>
    </div>
    <div class="px-3 py-2 md:border-r border-ink border-b md:border-b-0 flex flex-col items-start">
      <div class="eyebrow text-[0.6rem]">Personal Best</div>
      <div class="font-display text-2xl md:text-3xl leading-none mt-1 italic" style="font-variation-settings: 'opsz' 144;">
        {{ best }}
      </div>
    </div>
    <div class="px-3 py-2 border-r border-ink flex flex-col items-start">
      <div class="eyebrow text-[0.6rem]">Margin</div>
      <div class="font-mono text-base md:text-lg font-medium leading-none mt-1.5 text-rust">
        ≤ {{ threshold }}<span class="text-xs ml-1 text-ink-soft">km</span>
      </div>
    </div>
    <div class="px-3 py-2 flex flex-col items-start">
      <div class="eyebrow text-[0.6rem]">Score ×</div>
      <div
        class="font-mono text-base md:text-lg font-medium leading-none mt-1.5"
        :class="multiplier < 1 ? 'text-rust' : 'text-ink'"
      >
        ×{{ multiplier.toFixed(2) }}
      </div>
    </div>
  </div>
</template>
