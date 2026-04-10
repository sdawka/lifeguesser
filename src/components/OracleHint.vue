<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ roundId: string }>();

const quip = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.roundId,
  () => {
    quip.value = null;
    error.value = null;
    loading.value = false;
  }
);

async function consult() {
  if (loading.value || quip.value) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch('/api/quip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: props.roundId }),
    });
    const data = (await res.json()) as { quip?: string; error?: string };
    if (!res.ok || !data.quip) throw new Error(data.error ?? 'Oracle is silent.');
    quip.value = data.quip;
  } catch (e: any) {
    error.value = e?.message ?? 'Oracle is silent.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="border border-ink bg-paper-dark">
    <div class="px-4 py-2 border-b border-ink flex items-baseline justify-between">
      <div class="eyebrow">Consult the Oracle</div>
      <div class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
        Free · but cryptic
      </div>
    </div>
    <div class="px-4 py-4 flex items-start gap-4">
      <div class="flex-1 min-h-[2.5rem] flex items-center">
        <p v-if="quip" class="font-serif italic text-lg leading-snug text-ink">
          <span class="font-display text-2xl text-rust mr-1">“</span>{{ quip }}<span class="font-display text-2xl text-rust ml-1">”</span>
        </p>
        <p v-else-if="error" class="font-mono text-xs uppercase tracking-widest2 text-rust">
          ⚠ {{ error }}
        </p>
        <p v-else-if="loading" class="font-serif italic text-ink-soft">
          The Oracle draws breath…
        </p>
        <p v-else class="font-serif italic text-ink-soft">
          A riddle, perhaps, to guide the wandering mind.
        </p>
      </div>
      <button
        v-if="!quip"
        type="button"
        class="btn-ghost whitespace-nowrap"
        :disabled="loading"
        @click="consult"
      >
        {{ loading ? 'Consulting…' : '✦ Summon Hint' }}
      </button>
    </div>
  </section>
</template>
