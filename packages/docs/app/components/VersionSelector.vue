<script setup lang="ts">
// Frozen versions list newer ones by reading the live manifest at the docs domain root
// (contracts: docs-versions-manifest). A missing or malformed manifest means "only this version".
interface ManifestEntry {
  version: string;
  path: string;
}

const { t, locale } = useI18n();
const currentVersion = useRuntimeConfig().public.docsVersion;

const entries = ref<ManifestEntry[]>([]);
const latest = ref<string | null>(null);

function parseManifest(data: unknown): { latest: string | null; entries: ManifestEntry[] } {
  if (typeof data !== "object" || data === null) return { latest: null, entries: [] };
  const record = data as Record<string, unknown>;
  const versions = Array.isArray(record.versions) ? record.versions : [];
  const parsed: ManifestEntry[] = [];
  for (const item of versions) {
    if (typeof item !== "object" || item === null) continue;
    const { version, path } = item as Record<string, unknown>;
    if (typeof version === "string" && typeof path === "string") parsed.push({ version, path });
  }
  return { latest: typeof record.latest === "string" ? record.latest : null, entries: parsed };
}

onMounted(async () => {
  try {
    // Native fetch: $fetch/useFetch would resolve against this version's app.baseURL.
    const response = await fetch(new URL("/versions.json", location.origin));
    if (!response.ok) return;
    const manifest = parseManifest(await response.json());
    entries.value = manifest.entries;
    latest.value = manifest.latest;
  } catch {
    // Local dev and the first release have no manifest.
  }
});

const items = computed(() => {
  const known = entries.value.map((entry) => entry.version);
  const versions = known.includes(currentVersion) ? known : [currentVersion, ...known];
  return versions.map((version) => {
    const tags = [
      version === currentVersion ? t("version.current") : null,
      version === latest.value ? t("version.latest") : null,
    ].filter((tag): tag is string => tag !== null);
    return {
      value: version,
      label: tags.length > 0 ? `${version} (${tags.join(", ")})` : version,
    };
  });
});

async function onSelect(version: string) {
  if (version === currentVersion) return;
  const entry = entries.value.find((candidate) => candidate.version === version);
  if (!entry) return;
  // Same locale's home of the chosen version: `/v1.4.0/`, `/v1.4.0/fr/`, `/v1.4.0/ar/`.
  const home =
    locale.value === "en" ? entry.path : `${entry.path.replace(/\/$/, "")}/${locale.value}/`;
  await navigateTo(home, { external: true });
}
</script>

<template>
  <USelect
    :model-value="currentVersion"
    :items="items"
    :aria-label="t('version.label')"
    class="w-44"
    @update:model-value="onSelect"
  />
</template>
