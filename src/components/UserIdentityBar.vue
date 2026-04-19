<!-- src/components/UserIdentityBar.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getUserId, setUserName } from '../lib/user-storage';
import type { User } from '../lib/leaderboard-types';

const user = ref<User | null>(null);
const loading = ref(true);
const showVerifyModal = ref(false);
const email = ref('');
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function fetchUser() {
  const userId = getUserId();
  if (!userId) {
    loading.value = false;
    return;
  }

  try {
    const res = await fetch(`/api/auth/me?userId=${userId}`);
    const data = await res.json();
    user.value = data.user;
    if (data.user) {
      setUserName(data.user.displayName);
    }
  } catch {
    // User doesn't exist in DB yet, that's okay
  } finally {
    loading.value = false;
  }
}

async function sendVerification() {
  if (!email.value || !user.value) return;
  sending.value = true;
  error.value = null;

  try {
    const res = await fetch('/api/auth/send-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.value.id, email: email.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to send');
    sent.value = true;
  } catch (err: any) {
    error.value = err?.message ?? 'Failed to send verification email';
  } finally {
    sending.value = false;
  }
}

onMounted(fetchUser);
</script>

<template>
  <div v-if="!loading && user" class="flex items-center gap-3 text-xs">
    <span class="font-medium">{{ user.displayName }}</span>
    <span v-if="user.emailVerifiedAt" class="text-moss">✓</span>
    <button
      v-else
      class="text-ink-soft hover:text-ink underline"
      @click="showVerifyModal = true"
    >
      Verify email
    </button>

    <!-- Verify Modal -->
    <div
      v-if="showVerifyModal"
      class="fixed inset-0 bg-ink/50 flex items-center justify-center z-overlay"
      @click.self="showVerifyModal = false"
    >
      <div class="bg-paper border border-ink p-6 max-w-sm w-full mx-4">
        <h3 class="font-display italic text-xl mb-4">Verify Your Email</h3>

        <div v-if="sent" class="text-moss">
          Check your inbox! Click the link to verify.
        </div>

        <form v-else @submit.prevent="sendVerification">
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            class="w-full border border-ink px-3 py-2 mb-3 bg-paper"
            required
          />
          <div v-if="error" class="text-rust text-sm mb-3">{{ error }}</div>
          <div class="flex gap-3">
            <button type="button" class="btn-ghost flex-1" @click="showVerifyModal = false">
              Cancel
            </button>
            <button type="submit" class="btn-ink flex-1" :disabled="sending">
              {{ sending ? 'Sending…' : 'Send Link' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
