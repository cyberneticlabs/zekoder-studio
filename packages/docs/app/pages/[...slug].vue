<script setup lang="ts">
import type { ContentNavigationItem } from "@nuxt/content";

const route = useRoute();
const { locale, t } = useI18n();
const localePath = useLocalePath();

// `/fr/getting-started/install` and `/getting-started/install` are the same content path.
const contentPath = computed(() => {
  const slug = [route.params.slug].flat().filter(Boolean);
  return `/${slug.join("/")}`;
});

const { data: doc } = await useAsyncData(
  () => `doc:${locale.value}:${contentPath.value}`,
  async () => {
    const localized = await queryCollection(`docs_${locale.value}`).path(contentPath.value).first();
    if (localized) return { page: localized, fallback: false };
    if (locale.value === "en") return null;
    // Not translated yet: show the English page with a notice.
    const english = await queryCollection("docs_en").path(contentPath.value).first();
    return english ? { page: english, fallback: true } : null;
  },
  { watch: [locale, contentPath] },
);

if (!doc.value) {
  throw createError({ statusCode: 404, statusMessage: "Page not found", fatal: true });
}

// Titles of every page, English first and then the active locale's own where translated.
async function loadTitles() {
  const english = await queryCollectionNavigation("docs_en");
  const titles = collectTitles(english);
  if (locale.value !== "en") {
    collectTitles(await queryCollectionNavigation(`docs_${locale.value}`), titles);
  }
  return { english, titles };
}

const { data: navigation } = await useAsyncData(
  () => `navigation:${locale.value}`,
  async () => {
    const { english, titles } = await loadTitles();
    return localizeNavigation(english, titles, localePath);
  },
  { watch: [locale] },
);

const { data: surround } = await useAsyncData(
  () => `surround:${locale.value}:${contentPath.value}`,
  async () => {
    const items = await queryCollectionItemSurroundings("docs_en", contentPath.value, {
      fields: ["description"],
    });
    const { titles } = await loadTitles();
    return localizeSurround(items, titles, localePath);
  },
  { watch: [locale, contentPath] },
);

const page = computed(() => doc.value?.page);
const isFallback = computed(() => doc.value?.fallback ?? false);
const tocLinks = computed(() => page.value?.body.toc?.links ?? []);

useSeoMeta({
  title: () => page.value?.title,
  description: () => page.value?.description,
});
</script>

<template>
  <UPage v-if="page" class="zk-wrap">
    <template #left>
      <UPageAside>
        <UContentNavigation :navigation="(navigation as ContentNavigationItem[]) ?? []" highlight />
      </UPageAside>
    </template>

    <UPageHeader :title="page.title" :description="page.description" />

    <UPageBody>
      <UAlert
        v-if="isFallback"
        color="warning"
        variant="subtle"
        icon="i-lucide-languages"
        class="mb-6"
        :title="t('page.notTranslatedTitle')"
        :description="t('page.notTranslatedBody')"
      />
      <div :lang="isFallback ? 'en' : undefined" :dir="isFallback ? 'ltr' : undefined">
        <ContentRenderer :value="page" />
      </div>
      <USeparator class="my-8" />
      <UContentSurround :surround="surround ?? []" />
    </UPageBody>

    <template v-if="tocLinks.length > 0" #right>
      <UContentToc :links="tocLinks" :title="t('page.toc')" />
    </template>
  </UPage>
</template>
