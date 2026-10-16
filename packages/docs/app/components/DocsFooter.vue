<script setup lang="ts">
const { t } = useI18n();

const legal = [
  { key: "privacy", href: "https://zekoder.com/#privacy" },
  { key: "cookies", href: "https://zekoder.com/#cookies" },
  { key: "terms", href: "https://zekoder.com/#terms" },
] as const;
</script>

<template>
  <footer class="border-t border-line bg-bg-alt pt-10 pb-8">
    <div class="zk-wrap flex flex-col gap-6">
      <div class="flex flex-col gap-3.5">
        <DocsLogo />
        <p class="m-0 text-[15px] text-fg-2">{{ t("footer.tagline") }}</p>
      </div>
      <div
        class="flex flex-wrap justify-between gap-x-8 gap-y-3 border-t border-line pt-6 text-[13px] leading-5 text-fg-2"
      >
        <p class="m-0">{{ t("footer.company") }}</p>
        <div class="flex flex-wrap gap-5">
          <a
            v-for="link in legal"
            :key="link.key"
            :href="link.href"
            class="zk-footlink text-[13px]"
          >
            {{ t(`footer.${link.key}`) }}
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
