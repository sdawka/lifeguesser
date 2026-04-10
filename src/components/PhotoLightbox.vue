<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
const props = defineProps<{ open: boolean; url: string; alt?: string; caption?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
watch(
  () => props.open,
  (o) => {
    if (typeof window === 'undefined') return;
    if (o) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    }
  }
);
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
        style="background: rgba(26,46,36,0.92)"
        @click="$emit('close')"
      >
        <div class="plate-frame bg-paper-dark max-w-[92vw] max-h-[86vh]" @click.stop>
          <img :src="url" :alt="alt ?? 'Specimen'" class="max-w-full max-h-[82vh] object-contain block" />
        </div>
        <div class="mt-4 font-mono text-[0.68rem] uppercase tracking-widest2 text-paper flex items-center gap-3">
          <span>{{ caption ?? '' }}</span>
          <span class="opacity-60">·</span>
          <span>Click or press Esc to close</span>
        </div>
        <button
          type="button"
          class="absolute top-4 right-4 w-10 h-10 border border-paper text-paper font-display text-2xl hover:bg-paper hover:text-ink transition"
          aria-label="Close"
          @click.stop="$emit('close')"
        >×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
