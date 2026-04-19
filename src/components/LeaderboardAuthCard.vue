<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { getUserId, setUserName } from '../lib/user-storage';
import type { User } from '../lib/leaderboard-types';

const userId = ref<string | null>(null);
const user = ref<User | null>(null);
const loading = ref(true);
const email = ref('');
const sending = ref(false);
const sent = ref(false);
const errorMsg = ref<string | null>(null);

const state = computed<'loading' | 'no-id' | 'verified' | 'unverified'>(() => {
  if (loading.value) return 'loading';
  if (!userId.value || !user.value) return 'no-id';
  if (user.value.emailVerifiedAt) return 'verified';
  return 'unverified';
});

async function fetchUser() {
  const id = getUserId();
  userId.value = id;
  if (!id) {
    loading.value = false;
    return;
  }
  try {
    const res = await fetch(`/api/auth/me?userId=${id}`);
    if (res.ok) {
      const data = await res.json() as { user: User | null };
      user.value = data.user;
      if (data.user) setUserName(data.user.displayName);
    }
  } catch {
    // Network issue — leave user=null; UI will show no-id fallback.
  } finally {
    loading.value = false;
  }
}

async function sendVerification() {
  if (!email.value || !user.value) return;
  sending.value = true;
  errorMsg.value = null;
  try {
    const res = await fetch('/api/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, email: email.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to send');
    sent.value = true;
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Failed to send verification email';
  } finally {
    sending.value = false;
  }
}

onMounted(fetchUser);
</script>

<template>
  <section class="max-w-2xl mx-auto mb-6 border border-ink bg-paper-dark">
    <div class="px-4 py-2 border-b border-ink flex items-baseline justify-between gap-3">
      <div class="eyebrow">Identification</div>
      <div class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
        Claim your expeditions
      </div>
    </div>

    <!-- Loading -->
    <div v-if="state === 'loading'" class="px-4 py-4 font-serif italic text-ink-soft">
      Checking your field book…
    </div>

    <!-- No userId / no user -->
    <div v-else-if="state === 'no-id'" class="px-4 py-4 flex flex-wrap items-baseline justify-between gap-3">
      <p class="font-serif italic text-ink-soft">
        No expedition on record from this device yet.
      </p>
      <a href="/play" class="btn-ink">Begin an Expedition →</a>
    </div>

    <!-- Verified -->
    <div v-else-if="state === 'verified'" class="px-4 py-3 flex items-baseline justify-between gap-3">
      <div class="flex items-baseline gap-3">
        <span class="font-mono text-[0.68rem] uppercase tracking-widest2 text-moss">
          ✓ Verified
        </span>
        <span class="font-serif">
          Signed in as
          <span class="font-display italic text-lg ml-1">{{ user?.displayName }}</span>
        </span>
      </div>
      <span class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
        Your streaks on this board will be highlighted.
      </span>
    </div>

    <!-- Unverified — send magic link -->
    <div v-else class="px-4 py-4">
      <div v-if="sent" class="border border-moss bg-moss/10 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-widest2 text-moss">
        ✓ Magic link dispatched to {{ email }}. Check your inbox — the link expires in 15 minutes.
      </div>
      <form v-else @submit.prevent="sendVerification" class="space-y-3">
        <div class="flex items-baseline gap-3 flex-wrap">
          <span class="eyebrow">Signed in locally as</span>
          <span class="font-display italic text-lg">{{ user?.displayName }}</span>
          <span class="flex-1 h-px bg-ink opacity-20 min-w-8"></span>
          <span class="font-mono text-[0.65rem] uppercase tracking-widest2 text-ink-soft">
            Unverified
          </span>
        </div>
        <p class="font-serif italic text-ink-soft text-sm">
          Attach an email to this identity so you can rejoin from another device.
        </p>
        <div class="flex gap-2 flex-wrap">
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            class="flex-1 min-w-[220px] border border-ink px-3 py-2 bg-paper font-mono text-sm"
            required
            :disabled="sending"
          />
          <button type="submit" class="btn-ink" :disabled="sending || !email">
            {{ sending ? 'Dispatching…' : 'Send Magic Link →' }}
          </button>
        </div>
        <div v-if="errorMsg" class="font-mono text-xs uppercase tracking-widest2 text-rust">
          ⚠ {{ errorMsg }}
        </div>
      </form>
    </div>
  </section>
</template>
