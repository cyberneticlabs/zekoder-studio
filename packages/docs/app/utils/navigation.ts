import type { ContentNavigationItem } from "@nuxt/content";

// The sidebar is always built from the English tree (the source of truth for what pages exist)
// and then relabelled and re-linked for the active locale.

export function collectTitles(
  items: ContentNavigationItem[],
  titles = new Map<string, string>(),
): Map<string, string> {
  for (const item of items) {
    titles.set(item.path, item.title);
    if (item.children) collectTitles(item.children, titles);
  }
  return titles;
}

function orderOf(item: ContentNavigationItem): number {
  return typeof item.order === "number" ? item.order : 0;
}

export function localizeNavigation(
  items: ContentNavigationItem[],
  titles: Map<string, string>,
  toLocalePath: (path: string) => string,
): ContentNavigationItem[] {
  return items
    .map((item) => ({
      ...item,
      title: titles.get(item.path) ?? item.title,
      path: toLocalePath(item.path),
      children: item.children ? localizeNavigation(item.children, titles, toLocalePath) : undefined,
    }))
    .sort((a, b) => orderOf(a) - orderOf(b));
}

// The query returns `null` for a missing neighbour even though its type does not say so.
export function localizeSurround<T extends { path: string; title: string }>(
  items: T[],
  titles: Map<string, string>,
  toLocalePath: (path: string) => string,
): T[] {
  const localized: T[] = [];
  for (const item of items) {
    localized.push(
      item
        ? { ...item, title: titles.get(item.path) ?? item.title, path: toLocalePath(item.path) }
        : item,
    );
  }
  return localized;
}
