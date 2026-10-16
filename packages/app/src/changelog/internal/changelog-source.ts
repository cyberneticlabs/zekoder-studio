import { useCallback, useEffect, useState } from "react";
import { brandReleasesApiUrl } from "@getpaseo/protocol/branding";
import type { ChangelogRelease } from "./parse-changelog";
import { mapGithubReleases } from "./zekoder-releases";

const RELEASES_PER_PAGE = 30;
const RELEASES_URL = brandReleasesApiUrl(RELEASES_PER_PAGE);

export type ChangelogState =
  | { status: "loading" }
  | { status: "ready"; releases: ChangelogRelease[] }
  | { status: "error" };

// Survives close/reopen so the second look paints without a spinner. The raw
// response text is kept alongside the releases so an unchanged revalidation can
// be dropped: handing back an equal-but-new array would re-render every release.
let cached: { raw: string; releases: ChangelogRelease[] } | null = null;

export interface Changelog {
  state: ChangelogState;
  reload: () => void;
}

/**
 * Reads Zekoder's release notes: the hand-written bodies of the GitHub Releases
 * on the public Zekoder Studio repository (see docs/release.md, "Release notes").
 *
 * This is deliberately not the repository's CHANGELOG.md. That file belongs to
 * upstream Paseo, is kept for upstream tooling, and describes Paseo versions
 * and sponsors, none of which an end user of this app should see. Prereleases
 * are included because betas are shipped to users; draft releases are never
 * returned by the unauthenticated API.
 *
 * The daemon is not involved: the changelog describes the app, a phone reaching
 * a relay already has internet, and going through a host would make the notes
 * depend on which host happens to be connected.
 *
 * Every open refetches, because the whole point of opening it is a release that
 * shipped after this app started. A previous result stays on screen while that
 * happens, and survives a failed revalidation.
 */
export function useChangelog(enabled: boolean): Changelog {
  const [state, setState] = useState<ChangelogState>(readCache);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setState(readCache());

    void (async () => {
      try {
        const response = await fetch(RELEASES_URL, {
          signal: controller.signal,
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) throw new Error(`Changelog request failed: ${response.status}`);
        const raw = await response.text();
        if (cached?.raw === raw) return;
        const releases = mapGithubReleases(JSON.parse(raw));
        if (releases.length === 0) throw new Error("Changelog has no releases");
        cached = { raw, releases };
        setState({ status: "ready", releases });
      } catch {
        if (controller.signal.aborted) return;
        if (cached) return;
        setState({ status: "error" });
      }
    })();

    return () => controller.abort();
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    cached = null;
    setAttempt((value) => value + 1);
  }, []);

  return { state, reload };
}

function readCache(): ChangelogState {
  return cached ? { status: "ready", releases: cached.releases } : { status: "loading" };
}
