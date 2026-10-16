import { expect, type Locator, type Page } from "@playwright/test";
import { BRAND } from "@getpaseo/protocol/branding";

const RELEASES_API_PREFIX = `https://api.github.com/repos/${BRAND.releasesRepository}/releases`;

export interface ServedRelease {
  tag: string;
  publishedAt: string;
  body: string[];
}

/**
 * Serves GitHub Releases to the app instead of the repository's real ones.
 *
 * The sheet renders whatever the release bodies contain, so a fixture is how a
 * test states which authoring shapes it cares about.
 */
export async function serveReleases(page: Page, releases: ServedRelease[]): Promise<void> {
  const payload = releases.map((served) => ({
    tag_name: served.tag,
    draft: false,
    prerelease: false,
    published_at: served.publishedAt,
    body: served.body.join("\n"),
  }));
  await page.route(
    (url) => url.href.startsWith(RELEASES_API_PREFIX),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      }),
  );
}

export async function openWhatsNew(page: Page): Promise<Locator> {
  await page.getByTestId("sidebar-help").click();
  await expect(page.getByTestId("sidebar-help-menu")).toBeVisible();
  await page.getByTestId("sidebar-help-changelog").click();

  const sheet = page.getByTestId("changelog-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

export function release(sheet: Locator, version: string): Locator {
  return sheet.getByTestId(`changelog-release-${version}`);
}
