<script setup lang="ts">
import { ref } from 'vue';
import { TAXON_PRESETS, PLACE_PRESETS } from '../lib/filters';

// Filter to only items with IDs (exclude "Any" and "World")
const taxonOptions = TAXON_PRESETS.filter(p => p.taxonIds?.length);
const placeOptions = PLACE_PRESETS.filter(p => p.placeIds?.length);

// All non-"Any" taxon IDs checked by default
const selectedTaxonIds = ref<Set<number>>(new Set(
  taxonOptions.flatMap(p => p.taxonIds ?? [])
));
// All non-"World" place IDs checked by default
const selectedPlaceIds = ref<Set<number>>(new Set(
  placeOptions.flatMap(p => p.placeIds ?? [])
));

function toggleTaxon(id: number) {
  if (selectedTaxonIds.value.has(id)) {
    selectedTaxonIds.value.delete(id);
  } else {
    selectedTaxonIds.value.add(id);
  }
  selectedTaxonIds.value = new Set(selectedTaxonIds.value); // trigger reactivity
}

function togglePlace(id: number) {
  if (selectedPlaceIds.value.has(id)) {
    selectedPlaceIds.value.delete(id);
  } else {
    selectedPlaceIds.value.add(id);
  }
  selectedPlaceIds.value = new Set(selectedPlaceIds.value); // trigger reactivity
}

function selectAllTaxa() {
  selectedTaxonIds.value = new Set(taxonOptions.flatMap(p => p.taxonIds ?? []));
}

function clearAllTaxa() {
  selectedTaxonIds.value = new Set();
}

function selectAllPlaces() {
  selectedPlaceIds.value = new Set(placeOptions.flatMap(p => p.placeIds ?? []));
}

function clearAllPlaces() {
  selectedPlaceIds.value = new Set();
}

function play() {
  const params = new URLSearchParams();
  // Pass comma-separated IDs only if not all are selected
  if (selectedTaxonIds.value.size > 0 && selectedTaxonIds.value.size < taxonOptions.length) {
    params.set('taxa', Array.from(selectedTaxonIds.value).join(','));
  }
  if (selectedPlaceIds.value.size > 0 && selectedPlaceIds.value.size < placeOptions.length) {
    params.set('places', Array.from(selectedPlaceIds.value).join(','));
  }
  // If all are selected, don't pass params (means "all")
  const qs = params.toString();
  window.location.href = '/play' + (qs ? '?' + qs : '');
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- Section I: Subject -->
    <section class="mb-10">
      <div class="flex items-baseline gap-4 mb-4">
        <span class="eyebrow">I.</span>
        <div class="eyebrow">Subject of Study</div>
        <div class="flex-1 h-px bg-ink opacity-30"></div>
        <div class="flex gap-2 text-xs">
          <button type="button" class="text-ink-soft hover:text-ink underline" @click="selectAllTaxa">All</button>
          <span class="text-ink-soft">/</span>
          <button type="button" class="text-ink-soft hover:text-ink underline" @click="clearAllTaxa">None</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in taxonOptions"
          :key="preset.taxonIds?.[0]"
          type="button"
          class="btn-ghost checkbox-toggle"
          :class="{ active: preset.taxonIds?.every(id => selectedTaxonIds.has(id)) }"
          @click="preset.taxonIds?.forEach(id => toggleTaxon(id))"
        >
          <span class="checkbox-indicator">{{ preset.taxonIds?.every(id => selectedTaxonIds.has(id)) ? '✓' : '' }}</span>
          {{ preset.label }}
        </button>
      </div>
    </section>

    <!-- Section II: Territory -->
    <section class="mb-12">
      <div class="flex items-baseline gap-4 mb-4">
        <span class="eyebrow">II.</span>
        <div class="eyebrow">Territory</div>
        <div class="flex-1 h-px bg-ink opacity-30"></div>
        <div class="flex gap-2 text-xs">
          <button type="button" class="text-ink-soft hover:text-ink underline" @click="selectAllPlaces">All</button>
          <span class="text-ink-soft">/</span>
          <button type="button" class="text-ink-soft hover:text-ink underline" @click="clearAllPlaces">None</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in placeOptions"
          :key="preset.placeIds?.[0]"
          type="button"
          class="btn-ghost checkbox-toggle"
          :class="{ active: preset.placeIds?.every(id => selectedPlaceIds.has(id)) }"
          @click="preset.placeIds?.forEach(id => togglePlace(id))"
        >
          <span class="checkbox-indicator">{{ preset.placeIds?.every(id => selectedPlaceIds.has(id)) ? '✓' : '' }}</span>
          {{ preset.label }}
        </button>
      </div>
    </section>

    <!-- CTA -->
    <div class="flex flex-col items-center gap-3">
      <button type="button" class="btn-ink" @click="play">
        Begin Expedition &nbsp;→
      </button>
      <p class="font-serif italic text-sm text-ink-soft">
        Endless mode &middot; miss once and the journal closes
      </p>
    </div>
  </div>
</template>

<style scoped>
.checkbox-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.checkbox-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  font-size: 0.75rem;
  border: 1px solid currentColor;
  border-radius: 0.125rem;
  opacity: 0.6;
}

.checkbox-toggle.active .checkbox-indicator {
  opacity: 1;
}
</style>
