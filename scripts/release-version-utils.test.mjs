import assert from "node:assert/strict";
import test from "node:test";
import {
  computeNextReleaseVersion,
  getReleaseInfoFromSourceTag,
  parseReleaseVersion,
} from "./release-version-utils.mjs";
import {
  compareDesktopTags,
  desktopVersionFromTag,
  parseDesktopTag,
} from "./desktop-release/release-data.mjs";

test("computes the next beta patch from a stable version", () => {
  assert.equal(computeNextReleaseVersion("0.1.59", "beta-patch"), "0.1.60-beta.1");
});

test("advances beta versions", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.1", "beta-next"), "0.1.60-beta.2");
});

test("promotes beta versions to stable", () => {
  assert.equal(computeNextReleaseVersion("0.1.60-beta.2", "promote"), "0.1.60");
});

test("parses beta release metadata", () => {
  assert.deepEqual(parseReleaseVersion("0.1.60-beta.1"), {
    version: "0.1.60-beta.1",
    major: 0,
    minor: 1,
    patch: 60,
    prerelease: "beta.1",
    baseVersion: "0.1.60",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
  });
});

test("emits beta release info from tags", () => {
  assert.deepEqual(getReleaseInfoFromSourceTag("v0.1.60-beta.1"), {
    sourceTag: "v0.1.60-beta.1",
    releaseTag: "v0.1.60-beta.1",
    version: "0.1.60-beta.1",
    baseVersion: "0.1.60",
    prerelease: "beta.1",
    isPrerelease: true,
    isBeta: true,
    betaNumber: 1,
    releaseType: "prerelease",
    releaseChannel: "beta",
    isSmokeTag: false,
  });
});

test("rejects non-beta prerelease versions", () => {
  assert.throws(() => parseReleaseVersion("0.1.60-canary.1"), /Expected beta prerelease versions/);
});

test("strict desktop tags derive the packaged version from the tag alone", () => {
  assert.equal(desktopVersionFromTag("v0.1.0"), "0.1.0");
  assert.equal(desktopVersionFromTag("v0.1.0-beta.3"), "0.1.0-beta.3");
});

test("strict desktop parsing rejects tags the upstream helpers still normalize", () => {
  for (const tag of [
    "desktop-v0.1.0",
    "desktop-macos-v0.1.0",
    "android-v0.1.0",
    "refs/tags/v0.1.0",
  ]) {
    assert.doesNotThrow(() => getReleaseInfoFromSourceTag(tag), tag);
    assert.throws(() => parseDesktopTag(tag), /Unsupported desktop release tag/, tag);
  }
  for (const tag of ["v0.1.0-canary.1", "v1.02.3", "v1.2.3-beta.01", "v1.2.3+meta"]) {
    assert.throws(() => parseDesktopTag(tag), /Unsupported desktop release tag/, tag);
  }
});

test("strict desktop ordering matches semantic precedence for beta numbers", () => {
  assert.equal(compareDesktopTags("v0.1.0-beta.9", "v0.1.0-beta.10"), -1);
  assert.equal(compareDesktopTags("v0.1.0-beta.10", "v0.1.0"), -1);
  assert.equal(compareDesktopTags("v0.1.0", "v0.1.0"), 0);
});
