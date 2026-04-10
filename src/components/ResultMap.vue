<script setup lang="ts">
import { ref, watch } from 'vue';
import { useLeafletMap } from './composables/useLeafletMap';

const props = defineProps<{
  guess: { lat: number; lng: number };
  actual: { lat: number; lng: number };
}>();

const mapEl = ref<HTMLElement | null>(null);
const { onReady } = useLeafletMap(mapEl);

let layers: any[] = [];
let mapRef: any = null;
let Lref: any = null;

function draw() {
  if (!mapRef || !Lref) return;
  for (const l of layers) l.remove();
  layers = [];

  const guess = Lref.circleMarker([props.guess.lat, props.guess.lng], {
    radius: 9,
    color: '#1a2e24',
    weight: 2,
    fillColor: '#9b3d1e',
    fillOpacity: 0.95,
  }).addTo(mapRef).bindTooltip('Your guess', { permanent: false, direction: 'top' });

  const actual = Lref.circleMarker([props.actual.lat, props.actual.lng], {
    radius: 10,
    color: '#1a2e24',
    weight: 2,
    fillColor: '#5b7246',
    fillOpacity: 0.95,
  }).addTo(mapRef).bindTooltip('Actual location', { permanent: false, direction: 'top' });

  const line = Lref.polyline(
    [
      [props.guess.lat, props.guess.lng],
      [props.actual.lat, props.actual.lng],
    ],
    { color: '#1a2e24', weight: 1.5, dashArray: '2,6' }
  ).addTo(mapRef);

  layers = [guess, actual, line];
  mapRef.fitBounds(line.getBounds(), { padding: [50, 50], maxZoom: 6 });
}

onReady((map, L) => {
  mapRef = map;
  Lref = L;
  draw();
});

watch(
  () => [props.guess, props.actual],
  () => draw(),
  { deep: true }
);
</script>

<template>
  <div class="relative">
    <div class="plate-frame">
      <div ref="mapEl" class="h-[58vh] min-h-[420px] w-full"></div>
    </div>
    <div class="absolute top-3 left-3 bg-paper border border-ink px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest2 flex items-center gap-3 pointer-events-none">
      <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-rust border border-ink"></span> You</span>
      <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-moss border border-ink"></span> Truth</span>
    </div>
  </div>
</template>
