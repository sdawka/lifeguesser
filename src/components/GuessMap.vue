<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { useLeafletMap } from './composables/useLeafletMap';

defineProps<{
  hasGuess?: boolean;
}>();

const emit = defineEmits<{
  (e: 'guess', lat: number, lng: number): void;
}>();

const mapEl = ref<HTMLElement | null>(null);
const marker = shallowRef<any>(null);
const { onReady, map } = useLeafletMap(mapEl);

onReady((map, L) => {
  map.on('click', (ev: any) => {
    const { lat, lng } = ev.latlng;
    if (marker.value) {
      marker.value.setLatLng([lat, lng]);
    } else {
      marker.value = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#1a2e24',
        weight: 2,
        fillColor: '#9b3d1e',
        fillOpacity: 0.95,
      }).addTo(map);
    }
    emit('guess', lat, lng);
  });
});

function reset() {
  if (marker.value) {
    marker.value.remove();
    marker.value = null;
  }
}

function invalidateSize() {
  // Leaflet needs this nudge when its container goes from display:none back to visible.
  map.value?.invalidateSize();
}

defineExpose({ reset, invalidateSize });
</script>

<template>
  <div class="relative">
    <div class="plate-frame">
      <div ref="mapEl" class="guess-map__canvas w-full"></div>
    </div>

    <!-- Floating center crosshair — quiet beacon, fades when a pin is dropped -->
    <div
      v-if="!hasGuess"
      class="pin-beacon"
      aria-hidden="true"
    >
      <span class="pin-beacon__ring"></span>
      <span class="pin-beacon__ring pin-beacon__ring--late"></span>
      <span class="pin-beacon__cross"></span>
    </div>

    <!-- Stamped callout — inky, letterpress, drop-shadow like a field-guide stamp -->
    <div
      v-if="!hasGuess"
      class="pin-stamp"
      aria-live="polite"
    >
      <span class="pin-stamp__dot"></span>
      <span class="pin-stamp__eyebrow font-mono uppercase tracking-widest2">Instruction</span>
      <span class="pin-stamp__body font-serif italic">
        Click the chart to drop a pin where you think this specimen was sighted.
      </span>
    </div>

    <!-- After a pin is set: tiny confirmation stamp -->
    <div
      v-else
      class="pin-confirm font-mono uppercase tracking-widest2"
      aria-live="polite"
    >
      <span class="pin-confirm__check">✓</span> Hypothesis pinned — click elsewhere to revise
    </div>
  </div>
</template>

<style scoped>
/* Map canvas sizing: mobile gets a tall pane since only one is visible;
   desktop caps at 52vh so the whole play grid fits in one viewport. */
.guess-map__canvas {
  height: min(60vh, 540px);
  min-height: 320px;
}
@media (min-width: 768px) {
  /* Matches PhotoPanel .plate-image sizing so the two panes line up and the
     whole play grid fits in one viewport. */
  .guess-map__canvas {
    height: min(calc(100vh - 460px), 500px);
    min-height: 220px;
  }
}

/* Centered pulsing beacon ring + crosshair over the map */
.pin-beacon {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 64px;
  height: 64px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  animation: beacon-fade 500ms ease-out both;
}

.pin-beacon__ring {
  position: absolute;
  inset: 0;
  border: 1.5px solid rgba(155, 61, 30, 0.85); /* rust */
  border-radius: 50%;
  animation: beacon-ring 2200ms ease-out infinite;
  opacity: 0;
}

.pin-beacon__ring--late {
  animation-delay: 1100ms;
}

.pin-beacon__cross {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  transform: translate(-50%, -50%);
  background:
    linear-gradient(to right, transparent 45%, rgba(26, 46, 36, 0.85) 45% 55%, transparent 55%),
    linear-gradient(to bottom, transparent 45%, rgba(26, 46, 36, 0.85) 45% 55%, transparent 55%);
  animation: beacon-cross 1600ms ease-in-out infinite;
}

@keyframes beacon-ring {
  0%   { opacity: 0;    transform: scale(0.3); }
  25%  { opacity: 0.9;  }
  100% { opacity: 0;    transform: scale(1.8); }
}

@keyframes beacon-cross {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1;    }
}

@keyframes beacon-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Stamped instruction card — letterpress / field-guide stamp feel */
.pin-stamp {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  max-width: min(84%, 420px);
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  column-gap: 0.55rem;
  row-gap: 0.25rem;
  align-items: baseline;
  padding: 0.7rem 1rem 0.75rem;
  background: var(--paper);
  color: var(--ink);
  border: 1px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  z-index: 6;
  animation: stamp-in 600ms cubic-bezier(0.22, 1, 0.36, 1) 220ms both;
}

.pin-stamp::before {
  /* Faint cross-hatch to nod at the engraving texture */
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(26, 46, 36, 0.08) 0 1px,
      transparent 1px 6px
    );
  pointer-events: none;
  mix-blend-mode: multiply;
}

.pin-stamp__dot {
  grid-row: 1;
  grid-column: 1;
  width: 0.45rem;
  height: 0.45rem;
  background: var(--rust);
  border-radius: 50%;
  margin-top: 0.3rem;
  animation: stamp-pulse 1400ms ease-in-out infinite;
}

.pin-stamp__eyebrow {
  grid-row: 1;
  grid-column: 2;
  font-size: 0.6rem;
  color: var(--ink-soft);
}

.pin-stamp__body {
  grid-row: 2;
  grid-column: 1 / -1;
  font-size: 0.9rem;
  line-height: 1.35;
  color: var(--ink);
}

@keyframes stamp-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translate(-50%, 0);   }
}

@keyframes stamp-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50%      { opacity: 1;    transform: scale(1.1);  }
}

/* Compact confirmation once pin is placed */
.pin-confirm {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  padding: 0.35rem 0.8rem;
  background: var(--paper);
  color: var(--ink-soft);
  border: 1px solid var(--ink);
  font-size: 0.6rem;
  z-index: 6;
  animation: confirm-in 500ms ease-out both;
  pointer-events: none;
}

.pin-confirm__check {
  color: var(--moss);
  margin-right: 0.15rem;
}

@keyframes confirm-in {
  from { opacity: 0; transform: translate(-50%, 4px); }
  to   { opacity: 1; transform: translate(-50%, 0);   }
}

@media (prefers-reduced-motion: reduce) {
  .pin-beacon__ring,
  .pin-beacon__cross,
  .pin-stamp__dot {
    animation: none;
  }
  .pin-stamp,
  .pin-confirm {
    animation-duration: 200ms;
  }
}
</style>
