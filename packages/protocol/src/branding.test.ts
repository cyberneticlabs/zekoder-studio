import { describe, expect, it } from "vitest";
import { BRAND, brandUrl } from "./branding.js";

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
