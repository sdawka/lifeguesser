<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  photoUrls: string[];
  attribution: { observer: string; license: string | null; url: string };
  figNumber?: number;
}>();

defineEmits<{ (e: 'zoom', url: string): void }>();

const currentIndex = ref(0);
const failedUrls = ref<Set<string>>(new Set());

watch(
  () => props.photoUrls,
  () => {
    currentIndex.value = 0;
    failedUrls.value = new Set();
  }
);

const visibleUrls = computed(() => props.photoUrls.filter((u) => !failedUrls.value.has(u)));
const currentUrl = computed(() => visibleUrls.value[currentIndex.value] ?? visibleUrls.value[0] ?? '');
const hasMultiple = computed(() => visibleUrls.value.length > 1);

function prev() {
  const n = visibleUrls.value.length;
  if (!n) return;
  currentIndex.value = (currentIndex.value - 1 + n) % n;
}
function next() {
  const n = visibleUrls.value.length;
  if (!n) return;
  currentIndex.value = (currentIndex.value + 1) % n;
}
function onError() {
  const url = currentUrl.value;
  if (!url) return;
  failedUrls.value.add(url);
  const n = visibleUrls.value.length;
  if (n === 0) {
    currentIndex.value = 0;
  } else if (currentIndex.value >= n) {
    currentIndex.value = 0;
  }
}
function selectThumb(i: number) {
  const url = props.photoUrls[i];
  if (!url || failedUrls.value.has(url)) return;
  const idx = visibleUrls.value.indexOf(url);
  if (idx >= 0) currentIndex.value = idx;
}
</script>

<template>
  <figure class="space-y-3">
    <div class="plate-frame relative">
      <img
        v-if="currentUrl"
        :src="currentUrl"
        alt="Specimen photograph"
        class="w-full max-h-[58vh] object-cover block cursor-zoom-in"
        loading="eager"
        @click="$emit('zoom', currentUrl)"
        @error="onError"
      />
      <div v-else class="w-full h-64 flex items-center justify-center font-serif italic text-ink-soft">
        Specimen photograph unavailable.
      </div>
      <button
        v-if="hasMultiple"
        type="button"
        class="absolute left-3 top-1/2 -translate-y-1/2 bg-paper border border-ink w-9 h-9 flex items-center justify-center font-display text-xl hover:bg-ink hover:text-paper transition"
        aria-label="Previous photograph"
        @click.stop="prev"
      >◀</button>
      <button
        v-if="hasMultiple"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 bg-paper border border-ink w-9 h-9 flex items-center justify-center font-display text-xl hover:bg-ink hover:text-paper transition"
        aria-label="Next photograph"
        @click.stop="next"
      >▶</button>
      <div
        v-if="hasMultiple"
        class="absolute top-3 right-3 bg-paper border border-ink px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-widest2 pointer-events-none"
      >
        Pl. {{ currentIndex + 1 }} / {{ visibleUrls.length }}
      </div>
    </div>

    <div v-if="photoUrls.length > 1" class="flex gap-2 flex-wrap">
      <button
        v-for="(url, i) in photoUrls"
        :key="url"
        type="button"
        class="w-14 h-14 border border-ink p-0.5 transition"
        :class="{
          'border-rust border-2': url === currentUrl,
          'opacity-60 hover:opacity-100': url !== currentUrl,
          'opacity-20': failedUrls.has(url),
        }"
        @click="selectThumb(i)"
      >
        <img :src="url" class="w-full h-full object-cover block" alt="" />
      </button>
    </div>

    <figcaption class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-ink-soft">
        Fig. {{ String(figNumber ?? 1).padStart(2, '0') }}
      </span>
      <span class="flex-1 h-px bg-ink opacity-20 min-w-8"></span>
      <span class="font-serif italic text-ink-soft">
        photographed by <span class="text-ink not-italic font-medium">{{ attribution.observer }}</span>
      </span>
      <span class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
        {{ attribution.license ?? 'All rights reserved' }}
      </span>
      <a :href="attribution.url" target="_blank" rel="noopener" class="link-ink font-mono text-[0.65rem] uppercase tracking-widest2">
        iNaturalist ↗
      </a>
    </figcaption>
  </figure>
</template>
