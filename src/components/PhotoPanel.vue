<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  photoUrls: string[];
  attribution: { observer: string; license: string | null; url: string };
  figNumber?: number;
}>();

const emit = defineEmits<{ (e: 'zoom', url: string, fromRect: DOMRect): void }>();

function onPhotoClick(ev: MouseEvent) {
  const target = ev.currentTarget as HTMLElement | null;
  if (!currentUrl.value || !target) return;
  emit('zoom', currentUrl.value, target.getBoundingClientRect());
}

const currentIndex = ref(0);
const failedUrls = ref<Set<string>>(new Set());
const loadedUrls = ref<Set<string>>(new Set());

watch(
  () => props.photoUrls,
  () => {
    currentIndex.value = 0;
    failedUrls.value = new Set();
    loadedUrls.value = new Set();
  }
);

const MAX_PHOTOS = 5;
const displayedUrls = computed(() => props.photoUrls.slice(0, MAX_PHOTOS));
const visibleUrls = computed(() => displayedUrls.value.filter((u) => !failedUrls.value.has(u)));
const currentUrl = computed(() => visibleUrls.value[currentIndex.value] ?? visibleUrls.value[0] ?? '');
const hasMultiple = computed(() => visibleUrls.value.length > 1);
const isLoaded = computed(() => !!currentUrl.value && loadedUrls.value.has(currentUrl.value));

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
function onLoad() {
  const url = currentUrl.value;
  if (!url) return;
  // Trigger reveal on the next frame so the transition fires reliably
  requestAnimationFrame(() => {
    loadedUrls.value = new Set([...loadedUrls.value, url]);
  });
}
function selectThumb(i: number) {
  const url = displayedUrls.value[i];
  if (!url || failedUrls.value.has(url)) return;
  const idx = visibleUrls.value.indexOf(url);
  if (idx >= 0) currentIndex.value = idx;
}
</script>

<template>
  <figure class="space-y-2">
    <div class="plate-frame relative overflow-hidden">
      <img
        v-if="currentUrl"
        :key="currentUrl"
        :src="currentUrl"
        alt="Specimen photograph"
        class="plate-image w-full object-cover block cursor-zoom-in"
        :class="{ 'plate-image--ready': isLoaded }"
        loading="eager"
        decoding="async"
        @click="onPhotoClick"
        @load="onLoad"
        @error="onError"
      />
      <div v-else class="w-full h-64 flex items-center justify-center font-serif italic text-ink-soft">
        Specimen photograph unavailable.
      </div>

      <!-- Developing-plate reveal overlay -->
      <div
        v-if="currentUrl"
        class="plate-overlay"
        :class="{ 'plate-overlay--gone': isLoaded }"
        aria-hidden="true"
      >
        <div class="plate-overlay__grain"></div>
        <div class="plate-overlay__hatch"></div>
        <div class="plate-overlay__sweep"></div>
        <div class="plate-overlay__label font-mono uppercase tracking-widest2">
          <span class="plate-overlay__dot"></span>
          exposing plate
          <span class="plate-overlay__ellipsis">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      </div>

      <button
        v-if="hasMultiple"
        type="button"
        class="absolute left-3 top-1/2 -translate-y-1/2 bg-paper border border-ink w-9 h-9 flex items-center justify-center font-display text-xl hover:bg-ink hover:text-paper transition z-10"
        aria-label="Previous photograph"
        @click.stop="prev"
      >◀</button>
      <button
        v-if="hasMultiple"
        type="button"
        class="absolute right-3 top-1/2 -translate-y-1/2 bg-paper border border-ink w-9 h-9 flex items-center justify-center font-display text-xl hover:bg-ink hover:text-paper transition z-10"
        aria-label="Next photograph"
        @click.stop="next"
      >▶</button>
      <div
        v-if="hasMultiple"
        class="absolute top-3 right-3 bg-paper border border-ink px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-widest2 pointer-events-none z-10"
      >
        Pl. {{ currentIndex + 1 }} / {{ visibleUrls.length }}
      </div>
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <button
        v-for="(url, i) in displayedUrls"
        v-show="displayedUrls.length > 1"
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
      <a
        :href="attribution.url"
        target="_blank"
        rel="noopener"
        class="link-ink font-mono text-[0.65rem] uppercase tracking-widest2 ml-auto"
      >
        iNaturalist ↗
      </a>
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
    </figcaption>
  </figure>
</template>

<style scoped>
.plate-image {
  opacity: 0;
  transform: scale(1.02);
  filter: blur(8px) saturate(0.4) sepia(0.3);
  transition:
    opacity 700ms ease-out,
    transform 900ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 900ms ease-out;
  will-change: opacity, transform, filter;
  max-height: min(60vh, 540px);
  min-height: 260px;
}
@media (min-width: 768px) {
  /* Cap subtracts room for header + HUD + action bar + section title +
     figcaption + HintCategories + gaps so the full plate+chart grid fits
     inside one viewport on typical laptop displays (≥ 720 tall). */
  .plate-image {
    max-height: min(calc(100vh - 460px), 500px);
    min-height: 220px;
  }
}

.plate-image--ready {
  opacity: 1;
  transform: scale(1);
  filter: blur(0) saturate(1) sepia(0);
}

.plate-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition:
    opacity 700ms ease-in,
    transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
  background: linear-gradient(
    135deg,
    rgba(237, 220, 190, 0.95),
    rgba(196, 160, 112, 0.9) 50%,
    rgba(154, 118, 78, 0.92)
  );
  will-change: opacity, transform;
  overflow: hidden;
}

.plate-overlay--gone {
  opacity: 0;
  transform: scale(1.06);
}

/* Film-grain layer */
.plate-overlay__grain {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(60, 40, 20, 0.28) 0.7px, transparent 0.8px);
  background-size: 3px 3px;
  mix-blend-mode: multiply;
  opacity: 0.6;
}

/* Diagonal cross-hatch (naturalist-plate engraving feel) */
.plate-overlay__hatch {
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

/* Slow diagonal sweep — light passing over the developing plate */
.plate-overlay__sweep {
  position: absolute;
  inset: -20% -40%;
  background: linear-gradient(
    100deg,
    transparent 42%,
    rgba(255, 245, 220, 0.35) 50%,
    transparent 58%
  );
  animation: plate-sweep 2600ms ease-in-out infinite;
  mix-blend-mode: screen;
}

@keyframes plate-sweep {
  0% { transform: translateX(-40%); }
  100% { transform: translateX(40%); }
}

.plate-overlay__label {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.62rem;
  color: rgba(46, 30, 12, 0.8);
  letter-spacing: 0.18em;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem;
  background: rgba(245, 232, 205, 0.7);
  border: 1px solid rgba(46, 30, 12, 0.4);
}

.plate-overlay__dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  background: rgba(180, 50, 30, 0.85);
  border-radius: 50%;
  animation: plate-pulse 1400ms ease-in-out infinite;
}

@keyframes plate-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50%      { opacity: 1;    transform: scale(1.1); }
}

.plate-overlay__ellipsis span {
  display: inline-block;
  animation: plate-ellipsis 1400ms ease-in-out infinite;
}
.plate-overlay__ellipsis span:nth-child(2) { animation-delay: 180ms; }
.plate-overlay__ellipsis span:nth-child(3) { animation-delay: 360ms; }

@keyframes plate-ellipsis {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .plate-image,
  .plate-overlay {
    transition-duration: 200ms;
  }
  .plate-overlay__sweep,
  .plate-overlay__dot,
  .plate-overlay__ellipsis span {
    animation: none;
  }
}
</style>
