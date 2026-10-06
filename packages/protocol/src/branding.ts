// Central brand constants. Plain values only: no wire schema, no imports from other protocol
// modules, so any protocol file can import this without creating a cycle.
export const BRAND = {
  name: "Zekoder",
  websiteUrl: "https://zekoder.net",
  deepLinkScheme: "zekoder",
  defaultDaemonPort: 6777,
  defaultHomeDirName: ".zekoder",
} as const;

export function brandUrl(path?: string): string {
  if (!path || path === "/") {
    return BRAND.websiteUrl;
  }
  // Fragments and queries attach directly to the origin.
  if (path.startsWith("#") || path.startsWith("?")) {
    return `${BRAND.websiteUrl}${path}`;
  }
  return `${BRAND.websiteUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}
