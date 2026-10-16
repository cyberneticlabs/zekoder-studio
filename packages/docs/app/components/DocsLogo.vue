<script setup lang="ts">
// Theme-aware lockup: the mark swaps blue/white with the color mode, the wordmark is live text
// in the brand display face. Public files are not rewritten by Vue, so the base URL is explicit.
const baseURL = useRuntimeConfig().app.baseURL;
const asset = (name: string) => `${baseURL.replace(/\/$/, "")}/brand/${name}`;
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <img :src="asset('logo-blue.png')" alt="" width="31" height="24" class="block dark:hidden" />
    <img :src="asset('logo-white.png')" alt="" width="31" height="24" class="hidden dark:block" />
    <span class="font-display text-xl leading-none font-bold tracking-tight text-fg">ZeKoder</span>
  </span>
</template>
