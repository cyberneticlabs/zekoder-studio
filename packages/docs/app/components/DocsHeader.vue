<script setup lang="ts">
const { t, locale, locales } = useI18n();
const localePath = useLocalePath();
const switchLocalePath = useSwitchLocalePath();

const localeItems = computed(() =>
  locales.value.map((item) => ({ label: item.name ?? item.code, value: item.code })),
);

async function onLocaleChange(code: string) {
  await navigateTo(switchLocalePath(code as typeof locale.value));
}
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-line bg-bg">
    <nav
      :aria-label="t('nav.main')"
      class="zk-wrap flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2"
    >
      <div class="flex items-center gap-4">
        <NuxtLink
          :to="localePath('/')"
          :aria-label="t('nav.home')"
          class="flex shrink-0 items-center no-underline"
        >
          <DocsLogo />
        </NuxtLink>
        <span class="text-fg-3" aria-hidden="true">/</span>
        <span class="text-[15px] font-medium text-fg-2">{{ t("nav.docs") }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <a href="https://zekoder.com" class="zk-navlink me-2">{{ t("nav.website") }}</a>
        <VersionSelector />
        <USelect
          :model-value="locale"
          :items="localeItems"
          :aria-label="t('nav.language')"
          class="w-36"
          @update:model-value="onLocaleChange"
        />
        <UColorModeButton :aria-label="t('nav.theme')" />
      </div>
    </nav>
  </header>
</template>
