import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { MACOS_MINIMUM_DARWIN_VERSION } from "./merge-mac-manifest.mjs";

// version and releaseNotes are optional exact-match checks used by the desktop GCS pipeline:
// every feed must carry the tag-derived version and the GitHub Release body verbatim.
export function validateDesktopManifests(
  { releaseDate, rolloutHours, version, releaseNotes },
  paths,
) {
  if (!Number.isFinite(rolloutHours) || rolloutHours < 0) {
    throw new Error(`expected non-negative rolloutHours, got ${rolloutHours}`);
  }

  for (const manifestPath of paths) {
    const manifest = load(fs.readFileSync(manifestPath, "utf8")) ?? {};
    if (manifest.rolloutHours !== rolloutHours) {
      throw new Error(
        `${manifestPath}: rolloutHours=${manifest.rolloutHours}, expected ${rolloutHours}`,
      );
    }
    if (manifest.releaseDate !== releaseDate) {
      throw new Error(
        `${manifestPath}: releaseDate=${manifest.releaseDate}, expected ${releaseDate}`,
      );
    }
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error(`${manifestPath}: missing or invalid version`);
    }
    if (version !== undefined && manifest.version !== version) {
      throw new Error(`${manifestPath}: version=${manifest.version}, expected ${version}`);
    }
    if (releaseNotes !== undefined && manifest.releaseNotes !== releaseNotes) {
      throw new Error(`${manifestPath}: releaseNotes differ from the GitHub Release body`);
    }
    if (
      manifestPath.endsWith("-mac.yml") &&
      manifest.minimumSystemVersion !== MACOS_MINIMUM_DARWIN_VERSION
    ) {
      throw new Error(
        `${manifestPath}: minimumSystemVersion=${manifest.minimumSystemVersion}, expected ${MACOS_MINIMUM_DARWIN_VERSION}`,
      );
    }
  }
}

function parseArgs(argv) {
  const paths = [];
  let releaseDate;
  let rolloutHours;
  let version;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--release-date") {
      releaseDate = argv[++index];
    } else if (argv[index] === "--rollout-hours") {
      rolloutHours = Number(argv[++index]);
    } else if (argv[index] === "--expected-version") {
      version = argv[++index];
    } else {
      paths.push(argv[index]);
    }
  }

  if (!releaseDate || rolloutHours === undefined || paths.length === 0) {
    throw new Error(
      "Usage: node scripts/validate-desktop-manifests.mjs --release-date <date> --rollout-hours <hours> <manifest...>",
    );
  }

  return { releaseDate, rolloutHours, version, paths };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { releaseDate, rolloutHours, version, paths } = parseArgs(process.argv.slice(2));
  validateDesktopManifests({ releaseDate, rolloutHours, version }, paths);
}
