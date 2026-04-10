<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { useLeafletMap } from './composables/useLeafletMap';

const emit = defineEmits<{
  (e: 'guess', lat: number, lng: number): void;
}>();

const mapEl = ref<HTMLElement | null>(null);
const marker = shallowRef<any>(null);
const { onReady } = useLeafletMap(mapEl);

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

defineExpose({ reset });
</script>

<template>
  <div class="relative">
    <div class="plate-frame">
      <div ref="mapEl" class="h-[58vh] min-h-[420px] w-full"></div>
    </div>
    <div class="absolute top-3 left-3 bg-paper border border-ink px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest2 text-ink pointer-events-none">
      ✦ Drop a pin to mark your hypothesis
    </div>
  </div>
</template>
