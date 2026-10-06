import { BRAND } from "@getpaseo/protocol/branding";

/**
 * Replaces the upstream product name in translation string values at load time, so locale files
 * stay identical to upstream and syncs do not conflict. Keys are untouched, and the match is
 * case-sensitive so `$PASEO_PORT` and lowercase `paseo` CLI commands are unaffected.
 */
export function rebrandTranslations<T>(resource: T): T {
  if (typeof resource === "string") {
    return resource.replace(/Paseo/g, BRAND.name) as T;
  }
  if (Array.isArray(resource)) {
    return resource.map((item) => rebrandTranslations(item)) as T;
  }
  if (typeof resource === "object" && resource !== null) {
    return Object.fromEntries(
      Object.entries(resource).map(([key, value]) => [key, rebrandTranslations(value)]),
    ) as T;
  }
  return resource;
}
