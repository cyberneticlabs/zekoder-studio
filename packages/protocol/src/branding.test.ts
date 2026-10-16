import { describe, expect, it } from "vitest";
import { BRAND, brandReleasesApiUrl, brandReleasesPageUrl, brandUrl } from "./branding.js";

describe("brandUrl", () => {
  it("returns the website origin without a path", () => {
    expect(brandUrl()).toBe("https://zekoder.net");
    expect(brandUrl("/")).toBe("https://zekoder.net");
    expect(BRAND.websiteUrl).toBe("https://zekoder.net");
  });

  it("appends a path with a leading slash", () => {
    expect(brandUrl("/docs/cli")).toBe("https://zekoder.net/docs/cli");
  });

  it("normalizes a path without a leading slash", () => {
    expect(brandUrl("docs/cli")).toBe("https://zekoder.net/docs/cli");
  });

  it("passes queries and fragments through", () => {
    expect(brandUrl("/docs/cli?x=1#top")).toBe("https://zekoder.net/docs/cli?x=1#top");
    expect(brandUrl("#download")).toBe("https://zekoder.net#download");
  });
});

describe("brand releases", () => {
  it("points at the public Zekoder Studio repository", () => {
    expect(brandReleasesPageUrl()).toBe(
      "https://github.com/cyberneticlabs/zekoder-studio/releases",
    );
    expect(brandReleasesApiUrl(30)).toBe(
      "https://api.github.com/repos/cyberneticlabs/zekoder-studio/releases?per_page=30",
    );
  });
});
