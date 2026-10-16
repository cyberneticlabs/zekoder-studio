<script setup lang="ts">
const { locale, localeProperties } = useI18n();
const uiLocale = useUiLocale();

useHead({
  htmlAttrs: {
    lang: computed(() => localeProperties.value.language ?? locale.value),
    dir: computed(() => localeProperties.value.dir ?? "ltr"),
  },
});
</script>

<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
