<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{ error: NuxtError }>();

const { t } = useI18n();
const localePath = useLocalePath();
const uiLocale = useUiLocale();

useHead({ title: () => t("page.notFoundTitle") });
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <div class="zk-wrap flex flex-col items-start gap-4 py-24">
        <p class="m-0 text-sm font-semibold tracking-wide text-fg-3 uppercase">
          {{ error.statusCode }}
        </p>
        <h1 class="m-0 font-display text-4xl font-bold">{{ t("page.notFoundTitle") }}</h1>
        <p class="m-0 text-lg text-fg-2">{{ t("page.notFoundBody") }}</p>
        <UButton :to="localePath('/')" size="lg">{{ t("page.backHome") }}</UButton>
      </div>
    </NuxtLayout>
  </UApp>
</template>
