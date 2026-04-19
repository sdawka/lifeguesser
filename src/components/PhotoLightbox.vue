<script setup lang="ts">
import { watch, onUnmounted } from 'vue';

const props = defineProps<{
  open: boolean;
  url: string;
  alt?: string;
  caption?: string;
  fromRect?: DOMRect | null;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const ENTER_MS = 420;
const LEAVE_MS = 360;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

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

// FLIP morph: animate the .plate-frame from the source thumbnail's rect to its
// natural centered position on enter, and back on leave. Uses Vue's <Transition>
// JS hooks so the backdrop fade and the frame morph stay in sync.
function flipFromTo(frame: HTMLElement, from: DOMRect, durationMs: number, dir: 'in' | 'out'): Promise<void> {
  const target = frame.getBoundingClientRect();
  const dx = from.left - target.left;
  const dy = from.top - target.top;
  const sx = from.width / Math.max(target.width, 1);
  const sy = from.height / Math.max(target.height, 1);
  const transformed = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  return new Promise((resolve) => {
    if (dir === 'in') {
      frame.style.transformOrigin = '0 0';
      frame.style.transform = transformed;
      frame.style.transition = 'none';
      void frame.offsetHeight; // reflow
      frame.style.transition = `transform ${durationMs}ms ${EASE}`;
      frame.style.transform = '';
    } else {
      frame.style.transformOrigin = '0 0';
      frame.style.transition = `transform ${durationMs}ms ${EASE}`;
      void frame.offsetHeight;
      frame.style.transform = transformed;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      frame.removeEventListener('transitionend', finish);
      resolve();
    };
    frame.addEventListener('transitionend', finish);
    // Safety fallback in case transitionend never fires
    setTimeout(finish, durationMs + 80);
  });
}

async function onEnter(el: Element, done: () => void) {
  const overlay = el as HTMLElement;
  const frame = overlay.querySelector<HTMLElement>('.lightbox__frame');
  // Backdrop fade
  overlay.style.opacity = '0';
  void overlay.offsetHeight;
  overlay.style.transition = `opacity ${ENTER_MS}ms ease`;
  overlay.style.opacity = '1';

  if (frame && props.fromRect) {
    await flipFromTo(frame, props.fromRect, ENTER_MS, 'in');
    frame.style.transformOrigin = '';
    frame.style.transition = '';
    frame.style.transform = '';
  }
  overlay.style.transition = '';
  done();
}

async function onLeave(el: Element, done: () => void) {
  const overlay = el as HTMLElement;
  const frame = overlay.querySelector<HTMLElement>('.lightbox__frame');
  overlay.style.transition = `opacity ${LEAVE_MS}ms ease`;
  overlay.style.opacity = '0';

  if (frame && props.fromRect) {
    await flipFromTo(frame, props.fromRect, LEAVE_MS, 'out');
  } else {
    await new Promise((r) => setTimeout(r, LEAVE_MS));
  }
  done();
}
</script>

<template>
  <Teleport to="body">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div
        v-if="open"
        class="lightbox fixed inset-0 flex flex-col items-center justify-center p-6"
        @click="$emit('close')"
      >
        <div class="lightbox__frame plate-frame bg-paper-dark max-w-[92vw] max-h-[86vh]" @click.stop>
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
.lightbox {
  /* Stay above Leaflet (panes use z-index ≤ 700) and any other stacking
     contexts on the page. */
  z-index: 9999;
  background: rgba(26, 46, 36, 0.92);
}
.lightbox__frame {
  /* Promote to its own layer so the FLIP transform is GPU-accelerated. */
  will-change: transform;
}
</style>
