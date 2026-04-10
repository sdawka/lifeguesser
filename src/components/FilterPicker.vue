<script setup lang="ts">
import { ref } from 'vue';
import { TAXON_PRESETS, PLACE_PRESETS } from '../lib/filters';

const selectedTaxon = ref<number | undefined>(undefined);
const selectedPlace = ref<number | undefined>(undefined);

function play() {
  const params = new URLSearchParams();
  if (selectedTaxon.value != null) params.set('taxon', String(selectedTaxon.value));
  if (selectedPlace.value != null) params.set('place', String(selectedPlace.value));
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
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in TAXON_PRESETS"
          :key="preset.label"
          type="button"
          class="btn-ghost"
          :class="{ active: selectedTaxon === preset.taxonId }"
          @click="selectedTaxon = preset.taxonId"
        >
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
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in PLACE_PRESETS"
          :key="preset.label"
          type="button"
          class="btn-ghost"
          :class="{ active: selectedPlace === preset.placeId }"
          @click="selectedPlace = preset.placeId"
        >
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
