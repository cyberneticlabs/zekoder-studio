import { describe, expect, it } from "vitest";
import { mapGithubReleases } from "./zekoder-releases";

function githubRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: "v0.12.0",
    name: "Zekoder 0.12.0",
    draft: false,
    prerelease: false,
    published_at: "2026-10-01T12:30:00Z",
    body: "Faster startup.",
    ...overrides,
  };
}

describe("mapGithubReleases", () => {
  it("maps tag, publish date and body to a release", () => {
    expect(mapGithubReleases([githubRelease()])).toEqual([
      {
        version: "0.12.0",
        date: "2026-10-01",
        sections: [{ title: null, body: "Faster startup." }],
      },
    ]);
  });

  it("keeps prereleases and the API's newest-first order", () => {
    const releases = mapGithubReleases([
      githubRelease({ tag_name: "v0.12.0-beta.2", prerelease: true }),
      githubRelease({ tag_name: "v0.12.0-beta.1", prerelease: true }),
    ]);
    expect(releases.map((release) => release.version)).toEqual(["0.12.0-beta.2", "0.12.0-beta.1"]);
  });

  it("drops tags that are not app releases", () => {
    const releases = mapGithubReleases([
      githubRelease({ tag_name: "zekoder-plugin-v1.2.0" }),
      githubRelease({ tag_name: "v0.12.0" }),
    ]);
    expect(releases.map((release) => release.version)).toEqual(["0.12.0"]);
  });

  it("drops releases without notes", () => {
    const releases = mapGithubReleases([
      githubRelease({ tag_name: "v0.12.2", body: "" }),
      githubRelease({ tag_name: "v0.12.1", body: null }),
      githubRelease({ tag_name: "v0.12.0", body: " \n\n" }),
      githubRelease({ tag_name: "v0.11.0" }),
    ]);
    expect(releases.map((release) => release.version)).toEqual(["0.11.0"]);
  });

  it("drops drafts", () => {
    expect(mapGithubReleases([githubRelease({ draft: true })])).toEqual([]);
  });

  it("leaves the date empty when the release was never published", () => {
    expect(mapGithubReleases([githubRelease({ published_at: null })])[0].date).toBe("");
  });

  it("splits headed bodies into sections the way the changelog does", () => {
    const [release] = mapGithubReleases([
      githubRelease({
        body: [
          "Intro paragraph.",
          "",
          "## New",
          "",
          "- Plugins panel",
          "",
          "### Fixed",
          "",
          "```md",
          "## not a heading",
          "```",
        ].join("\n"),
      }),
    ]);
    expect(release.sections).toEqual([
      { title: null, body: "Intro paragraph." },
      { title: "New", body: "- Plugins panel" },
      { title: "Fixed", body: "```md\n## not a heading\n```" },
    ]);
  });

  it("rejects a payload that is not a release list", () => {
    expect(() => mapGithubReleases({ message: "API rate limit exceeded" })).toThrow();
  });
});
