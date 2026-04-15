<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getUserName } from '../lib/user-storage';

const userName = ref<string | null>(null);

onMounted(() => {
  userName.value = getUserName();
});
</script>

<template>
  <template v-if="userName">
    <span class="opacity-40">·</span>
    <span class="user-identity">Playing as <strong>{{ userName }}</strong></span>
  </template>
</template>

<style scoped>
.user-identity {
  font-size: 0.68rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
}
</style>
