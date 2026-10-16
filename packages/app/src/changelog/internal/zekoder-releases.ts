import { z } from "zod";
import { parseReleaseBody, type ChangelogRelease } from "./parse-changelog";

const githubReleasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    published_at: z.string().nullable(),
    body: z.string().nullable(),
    draft: z.boolean(),
  }),
);

const LEADING_V = /^v(?=\d)/i;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Maps the GitHub REST `releases` response to what the sheet renders. Releases
 * keep the API's order (newest first). A release with no written notes has
 * nothing to show and is dropped.
 */
export function mapGithubReleases(payload: unknown): ChangelogRelease[] {
  return githubReleasesSchema
    .parse(payload)
    .filter((release) => !release.draft)
    .map((release) => ({
      version: release.tag_name.replace(LEADING_V, ""),
      date: release.published_at?.match(ISO_DATE_PREFIX)?.[0] ?? "",
      sections: parseReleaseBody(release.body ?? ""),
    }))
    .filter((release) => release.sections.length > 0);
}
