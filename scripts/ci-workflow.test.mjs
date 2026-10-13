import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { relative as relativePath } from "node:path";
import test from "node:test";

const repoRoot = new URL("../", import.meta.url);
const ciWorkflowPath = new URL(".github/workflows/ci.yml", repoRoot);
const dockerWorkflowPath = new URL(".github/workflows/docker.yml", repoRoot);
const nixWorkflowPath = new URL(".github/workflows/nix.yml", repoRoot);
const filtersPath = new URL(".github/ci-paths.yml", repoRoot);
const serverTsconfigPath = new URL("packages/server/tsconfig.server.json", repoRoot);
const desktopPackagePath = new URL("packages/desktop/package.json", repoRoot);

const gatedCiJobs = new Map([
  ["format", { name: "format", contract: "format" }],
  ["lint", { name: "lint", contract: "quality" }],
  ["typecheck", { name: "typecheck", contract: "quality" }],
  ["server-tests-ubuntu", { name: "server-tests (ubuntu-latest)", contracts: ["server", "hub"] }],
  ["server-tests-windows", { name: "server-tests (windows-latest)", contracts: ["server", "hub"] }],
  ["server-tests-macos", { name: "server-tests (macos-14, file observation)", contract: "server" }],
  ["desktop-tests-ubuntu", { name: "desktop-tests (ubuntu-latest)", contract: "desktop" }],
  ["desktop-tests-windows", { name: "desktop-tests (windows-latest)", contract: "desktop" }],
  ["app-tests", { name: "app-tests", contract: "app" }],
  ["sdk-tests", { name: "sdk-tests", contract: "sdk" }],
  ["playwright-1", { name: "playwright (shard 1/4)", contract: "browser" }],
  ["playwright-2", { name: "playwright (shard 2/4)", contract: "browser" }],
  ["playwright-3", { name: "playwright (shard 3/4)", contract: "browser" }],
  ["playwright-4", { name: "playwright (shard 4/4)", contract: "browser" }],
  ["relay-tests", { name: "relay-tests", contract: "relay" }],
  ["cli-tests-1", { name: "cli-tests (shard 1/3)", contract: "cli" }],
  ["cli-tests-2", { name: "cli-tests (shard 2/3)", contract: "cli" }],
  ["cli-tests-3", { name: "cli-tests (shard 3/3)", contract: "cli" }],
]);

function jobBlocks(source) {
  const jobs = new Map();
  let currentJob;

  for (const line of source.split("\n")) {
    const jobMatch = /^  ([a-z0-9-]+):\s*$/.exec(line);
    if (jobMatch) {
      currentJob = jobMatch[1];
      jobs.set(currentJob, []);
      continue;
    }
    if (currentJob) jobs.get(currentJob).push(line);
  }
  return jobs;
}

function loadFilters(path) {
  const filters = {};
  let currentFilter;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const filterMatch = /^([a-z_]+):\s*$/.exec(line);
    if (filterMatch) {
      currentFilter = filterMatch[1];
      filters[currentFilter] = [];
      continue;
    }
    const patternMatch = /^  - "([^"]+)"\s*$/.exec(line);
    if (currentFilter && patternMatch) filters[currentFilter].push(patternMatch[1]);
  }
  return filters;
}

function filesUnder(relativeDirectory, predicate) {
  const directory = new URL(`${relativeDirectory}/`, repoRoot);
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      [relativeDirectory, relativePath(directory.pathname, entry.parentPath), entry.name]
        .filter(Boolean)
        .join("/")
        .replaceAll("\\", "/"),
    )
    .filter(predicate)
    .sort();
}

test("gated checks are statically named jobs with real job-level gating", () => {
  const workflowSource = readFileSync(ciWorkflowPath, "utf8");
  const jobs = jobBlocks(workflowSource);
  const trigger = workflowSource.split("jobs:", 1)[0];

  assert.match(trigger, /^\s+merge_group:\s*$/m);
  assert.doesNotMatch(workflowSource, /strategy:\s*\n\s+matrix:/);
  assert.doesNotMatch(workflowSource, /RUN_TESTS|Skip unaffected|No .* changes detected/);

  for (const [jobId, expected] of gatedCiJobs) {
    const job = jobs.get(jobId)?.join("\n");
    assert.ok(job, `missing static job ${jobId}`);
    assert.match(job, new RegExp(`^    name: ${expected.name.replace(/[()]/g, "\\$&")}$`, "m"));
    assert.match(job, /needs\.changes\.outputs\.full != 'false'/);
    for (const contract of expected.contracts ?? [expected.contract]) {
      assert.match(job, new RegExp(`needs\\.changes\\.outputs\\.${contract} != 'false'`));
    }
  }
});

test("change gating allows superseded workflow runs to cancel", () => {
  for (const workflowPath of [ciWorkflowPath, dockerWorkflowPath, nixWorkflowPath]) {
    const source = readFileSync(workflowPath, "utf8");
    assert.doesNotMatch(
      source,
      /\$\{\{\s*always\(\)/,
      "always() keeps jobs alive after concurrency cancellation; use !cancelled() for fail-open gating",
    );
  }
});

test("focused contracts stay inside existing required checks", () => {
  const jobs = jobBlocks(readFileSync(ciWorkflowPath, "utf8"));
  const changes = jobs.get("changes")?.join("\n") ?? "";
  const server = jobs.get("server-tests-ubuntu")?.join("\n") ?? "";
  const desktop = jobs.get("desktop-tests-ubuntu")?.join("\n") ?? "";

  assert.match(changes, /scripts\/daemon-launch-contract\.test\.mjs/);
  assert.doesNotMatch(changes, /Install dependencies|npm run build/);

  assert.match(server, /test:hub-cli-contract/);
  assert.match(server, /npm run test --workspace=@getpaseo\/server/);
  assert.ok(!jobs.has("hub-cli-contract"));

  assert.match(desktop, /test:e2e:renderer/);
  assert.match(desktop, /test:e2e:browser-tabs/);
  assert.match(desktop, /npm run test --workspace=@getpaseo\/desktop/);
  assert.ok(!jobs.has("desktop-browser-bridge"));
  assert.ok(!jobs.has("playwright-desktop"));
});

test("documentation-only changes skip every check and packaging build", () => {
  const docsPatterns = ["docs/**", ".zekoder/**", "*.md", "LICENSE"];
  const changes = jobBlocks(readFileSync(ciWorkflowPath, "utf8")).get("changes")?.join("\n") ?? "";

  assert.match(
    changes,
    /id: docs\s*\n\s+if: \$\{\{ github\.event_name == 'push' \|\| github\.event_name == 'pull_request' \}\}/,
  );
  assert.match(changes, /predicate-quantifier: every/);
  for (const pattern of docsPatterns) assert.ok(changes.includes(`- "!${pattern}"`), pattern);
  assert.match(changes, /full: \$\{\{ steps\.docs\.outputs\.code != 'false' && \(/);
  for (const contract of new Set(
    [...gatedCiJobs.values()].flatMap((job) => job.contracts ?? [job.contract]),
  )) {
    assert.match(
      changes,
      new RegExp(
        `${contract}: \\$\\{\\{ steps\\.docs\\.outputs\\.code == 'false' && 'false' \\|\\| steps\\.filter\\.outputs\\.${contract} \\}\\}`,
      ),
    );
  }

  for (const workflow of ["docker.yml", "desktop-packages.yml"]) {
    const trigger = readFileSync(new URL(`.github/workflows/${workflow}`, repoRoot), "utf8")
      .split("pull_request:", 1)[0]
      .split("jobs:", 1)[0];
    for (const pattern of docsPatterns)
      assert.ok(trigger.includes(`- "${pattern}"`), `${workflow} ${pattern}`);
  }
});

test("server builds exclude test utilities at every domain depth", () => {
  const tsconfig = JSON.parse(readFileSync(serverTsconfigPath, "utf8"));
  assert.ok(tsconfig.exclude.includes("src/server/**/test-utils/**"));
  assert.ok(!tsconfig.exclude.includes("src/server/test-utils/**"));
});

test("PR routing declares stable behavior ownership", () => {
  const filters = loadFilters(filtersPath);
  assert.deepEqual(filters, {
    routing: [".github/ci-paths.yml"],
    workspace: [
      ".mise.toml",
      ".tool-versions",
      "package.json",
      "package-lock.json",
      "patches/**",
      "scripts/**",
      "tsconfig.json",
      "tsconfig.base.json",
      "vitest.config.ts",
    ],
    ci: [".github/actions/**", ".github/workflows/ci.yml"],
    format: [
      ".agents/**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      ".github/**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      "**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      "packages/expo-two-way-audio/**",
    ],
    quality: ["**/*.{cjs,js,json,jsx,mjs,ts,tsx}", "packages/expo-two-way-audio/**"],
    hub: ["packages/cli/src/commands/hub/**", "packages/server/src/server/hub/**"],
    server: ["plugins/**", "packages/server/**", "packages/app/e2e/support/fixtures/recording.*"],
    desktop: [
      "packages/desktop/**",
      "packages/app/src/desktop/**",
      "packages/server/src/server/browser-tools/**",
      "packages/app/e2e/support/**",
      "packages/app/*config.{cjs,js,ts}",
      "packages/app/package.json",
    ],
    app: ["packages/app/**", "packages/expo-two-way-audio/**"],
    sdk: [
      "packages/plugin/**",
      "plugin-examples/**",
      "public-docs/plugins/**",
      "packages/client/**",
      "packages/highlight/**",
      "packages/protocol/**",
    ],
    browser: [
      "packages/server/src/server/agent/provider-snapshot-manager.ts",
      "packages/server/src/server/session/provider/provider-catalog-session.ts",
      "packages/client/src/compat/normalize-provider-models.ts",
      "packages/protocol/src/client-capabilities.ts",
      "packages/server/src/server/agent/provider-registry.ts",
      "packages/server/src/server/agent/agent-sdk-types.ts",
      "packages/server/src/server/agent/providers/codex-app-server-agent.ts",
      "packages/server/src/server/agent/providers/claude/agent.ts",
      "packages/server/src/server/agent/plugin-provider.ts",
      "packages/server/src/server/plugins/{index,plugin-process,plugin-process-protocol,runtime}.ts",
      "packages/server/src/executable-resolution/**",
      "packages/plugin/src/server/provider.ts",
      "packages/app/src/!(desktop)/**",
      "packages/app/e2e/browser/**",
      "packages/app/e2e/support/**",
      "packages/app/assets/**",
      "packages/app/public/**",
      "packages/app/index.ts",
      "packages/app/*config.{cjs,js,ts}",
      "packages/app/package.json",
    ],
    relay: ["packages/relay/**"],
    cli: ["packages/cli/**"],
  });
});

test("cross-package invariants live in the suite that owns them", () => {
  const cliTests = filesUnder("packages/cli", (path) => path.endsWith(".test.ts"));
  assert.ok(cliTests.length > 0);
  for (const path of cliTests) {
    assert.doesNotMatch(
      readFileSync(new URL(path, repoRoot), "utf8"),
      /server\/src\/server\/test-utils/,
      path,
    );
  }

  const protocolWireCompatibility = new URL(
    "packages/protocol/src/messages.wire-compat.test.ts",
    repoRoot,
  );
  assert.match(readFileSync(protocolWireCompatibility, "utf8"), /wire schema compatibility/);
});

test("browser and desktop tests have exclusive, directory-owned suites", () => {
  const filters = loadFilters(filtersPath);
  const browserSpecs = filesUnder("packages/app/e2e", (path) => path.endsWith(".spec.ts"));
  const desktopSpecs = filesUnder("packages/desktop/e2e", (path) => path.endsWith(".spec.ts"));
  const electronModules = filesUnder("packages/app/src", (path) => /\.electron\.tsx?$/.test(path));

  assert.ok(browserSpecs.length > 0);
  assert.ok(desktopSpecs.length > 0);
  assert.ok(browserSpecs.every((path) => path.startsWith("packages/app/e2e/browser/")));
  assert.ok(desktopSpecs.every((path) => path.startsWith("packages/desktop/e2e/")));
  assert.ok(electronModules.every((path) => path.startsWith("packages/app/src/desktop/")));

  const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, "utf8"));
  assert.match(desktopPackage.scripts.test, /--exclude ["']e2e\/\*\*["']/);

  for (const path of browserSpecs) {
    assert.doesNotMatch(
      readFileSync(new URL(path, repoRoot), "utf8"),
      /paseoDesktop|injectDesktopBridge/,
    );
  }
  for (const path of desktopSpecs) {
    assert.ok(path.startsWith("packages/desktop/e2e/"));
  }

  const routingSource = readFileSync(filtersPath, "utf8");
  assert.doesNotMatch(routingSource, /desktop_bridge|playwright_desktop|browser-\*|browser-\*\//);
  assert.deepEqual(filters.desktop, [
    "packages/desktop/**",
    "packages/app/src/desktop/**",
    "packages/server/src/server/browser-tools/**",
    "packages/app/e2e/support/**",
    "packages/app/*config.{cjs,js,ts}",
    "packages/app/package.json",
  ]);
  assert.deepEqual(filters.browser, [
    "packages/server/src/server/agent/provider-snapshot-manager.ts",
    "packages/server/src/server/session/provider/provider-catalog-session.ts",
    "packages/client/src/compat/normalize-provider-models.ts",
    "packages/protocol/src/client-capabilities.ts",
    "packages/server/src/server/agent/provider-registry.ts",
    "packages/server/src/server/agent/agent-sdk-types.ts",
    "packages/server/src/server/agent/providers/codex-app-server-agent.ts",
    "packages/server/src/server/agent/providers/claude/agent.ts",
    "packages/server/src/server/agent/plugin-provider.ts",
    "packages/server/src/server/plugins/{index,plugin-process,plugin-process-protocol,runtime}.ts",
    "packages/server/src/executable-resolution/**",
    "packages/plugin/src/server/provider.ts",
    "packages/app/src/!(desktop)/**",
    "packages/app/e2e/browser/**",
    "packages/app/e2e/support/**",
    "packages/app/assets/**",
    "packages/app/public/**",
    "packages/app/index.ts",
    "packages/app/*config.{cjs,js,ts}",
    "packages/app/package.json",
  ]);
});

test("packaging runs on main without allocating pull-request runners", () => {
  for (const workflowPath of [dockerWorkflowPath, nixWorkflowPath]) {
    const source = readFileSync(workflowPath, "utf8");
    const trigger = source.split("jobs:", 1)[0];
    assert.match(trigger, /push:\s*\n\s+branches: \[main\]/);
    assert.doesNotMatch(trigger, /pull_request/);
    assert.doesNotMatch(source, /dorny\/paths-filter/);
  }
});

test("desktop packaging smokes main pushes and only the pull requests that touch packaging", () => {
  const source = readFileSync(new URL(".github/workflows/desktop-packages.yml", repoRoot), "utf8");
  const trigger = source.split("jobs:", 1)[0];
  assert.match(trigger, /push:\s*\n\s+branches: \[main\]/);
  assert.match(trigger, /pull_request:\s*\n\s+branches: \[main\]\s*\n\s+paths:/);
  assert.match(trigger, /- "packages\/desktop\/\*\*"/);
  assert.doesNotMatch(source, /dorny\/paths-filter/);
  for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
    assert.match(source, new RegExp(`${action}@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+`));
  }
});

const desktopReleasePath = new URL(".github/workflows/desktop-release.yml", repoRoot);

function withoutComments(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

// Only the entries under `jobs:`, so trigger keys such as `push:` are not mistaken for jobs.
function jobsOf(source) {
  return jobBlocks(source.slice(source.indexOf("\njobs:")));
}

function jobPermissions(jobSource) {
  const match = /^ {4}permissions:\n((?: {6}.+\n)+)/m.exec(`${jobSource}\n`);
  return match
    ? match[1]
        .trim()
        .split("\n")
        .map((line) => line.trim())
    : [];
}

test("desktop release starts only from a pushed version tag", () => {
  const source = withoutComments(readFileSync(desktopReleasePath, "utf8"));
  const trigger = source.split("\njobs:", 1)[0];

  assert.match(trigger, /^on:\n {2}push:\n {4}tags:\n {6}- "v\*"\n/m);
  assert.doesNotMatch(trigger, /workflow_dispatch|pull_request|release:|schedule|branches/);
  assert.doesNotMatch(source, /desktop-(?:macos-|linux-|windows-)?v|checkout_ref|inputs\./);
  assert.doesNotMatch(source, /npm version|npm publish|release:(?:patch|minor|promote|beta)/);
  assert.doesNotMatch(source, /gh release create|--clobber/);
  assert.match(source, /--publish never/);
  assert.match(source, /cancel-in-progress: false/);
});

test("desktop release jobs hold the narrowest permissions", () => {
  const jobs = jobsOf(readFileSync(desktopReleasePath, "utf8"));
  const names = [...jobs.keys()];
  assert.deepEqual(names, ["preflight", "release-notes", "build", "publish", "finalize"]);

  const permissions = new Map(
    names.map((name) => [name, jobPermissions(jobs.get(name).join("\n"))]),
  );
  // Only the publication job can mint cloud credentials, and it cannot write to GitHub.
  assert.deepEqual(permissions.get("publish"), ["contents: read", "id-token: write"]);
  for (const [name, granted] of permissions) {
    if (name !== "publish") assert.ok(!granted.includes("id-token: write"), name);
  }
  // Only the notes and finalization jobs can touch GitHub Releases.
  assert.deepEqual(permissions.get("release-notes"), ["contents: write"]);
  assert.deepEqual(permissions.get("finalize"), ["contents: write"]);
  assert.ok(!permissions.get("build").includes("contents: write"));
  assert.ok(!permissions.get("preflight").includes("contents: write"));
  assert.match(readFileSync(desktopReleasePath, "utf8"), /^permissions:\n {2}contents: read$/m);
});

test("desktop release publishes only after every target and finalizes after publication", () => {
  const source = readFileSync(desktopReleasePath, "utf8");
  const jobs = jobsOf(source);
  const build = jobs.get("build").join("\n");

  for (const target of ["darwin-arm64", "darwin-x64", "win32-x64", "win32-arm64", "linux-x64"]) {
    assert.match(build, new RegExp(`- target: ${target}\\n`));
  }
  assert.match(build, /fail-fast: false/);
  assert.match(jobs.get("publish").join("\n"), /needs: \[preflight, release-notes, build\]/);
  assert.match(jobs.get("finalize").join("\n"), /needs: \[preflight, publish\]/);
  assert.match(jobs.get("build").join("\n"), /needs: \[preflight, release-notes\]/);
  assert.doesNotMatch(jobs.get("build").join("\n"), /google-github-actions|publish-release/);
  assert.match(jobs.get("publish").join("\n"), /google-github-actions\/auth@[0-9a-f]{40}/);
  assert.match(jobs.get("publish").join("\n"), /verify-tag/);
});

test("desktop release ships macOS unsigned only when no Apple secrets exist", () => {
  const source = readFileSync(desktopReleasePath, "utf8");
  const build = jobsOf(source).get("build").join("\n");
  // Scoped to the darwin case so the Windows branch's own unsigned policy cannot satisfy these.
  const darwin = /^ {12}darwin\)\n([\s\S]*?)^ {14};;$/m.exec(build)?.[1];
  assert.ok(darwin, "darwin case of the signing policy step");

  assert.match(darwin, /SIGNING_POLICY=notarized/);
  assert.match(darwin, /SIGNING_POLICY=unsigned/);
  assert.match(darwin, /-c\.mac\.notarize=false/);
  assert.match(darwin, /-c\.mac\.hardenedRuntime=false/);
  assert.match(darwin, /::error::[^\n]*missing/);
  assert.doesNotMatch(darwin, /mac\.identity/);

  assert.match(build, /npm run build:desktop[\s\S]*\$\{BUILDER_SIGNING_FLAGS:-\}/);
  assert.match(
    build,
    /Verify macOS signature and notarization\n\s+if: matrix\.platform == 'darwin' && env\.SIGNING_POLICY == 'notarized'/,
  );
});

test("inherited upstream publishing jobs only run in the upstream repository", () => {
  const guard = "github.repository == 'getpaseo/paseo'";
  const expectations = [
    ["desktop-rollout.yml", ["stamp"]],
    ["deploy-app.yml", ["deploy"]],
    ["deploy-website.yml", ["deploy"]],
    ["android-apk-release.yml", ["ensure-release", "publish-android-apk"]],
    ["release-notes-sync.yml", ["sync-release-notes"]],
    ["docker.yml", ["publish"]],
    ["nix.yml", ["build", "build-desktop-darwin"]],
    ["nix-update-hash.yml", ["update-hash"]],
  ];
  for (const [file, guardedJobs] of expectations) {
    const jobs = jobsOf(readFileSync(new URL(`.github/workflows/${file}`, repoRoot), "utf8"));
    for (const job of guardedJobs) {
      assert.ok(jobs.get(job)?.join("\n").includes(guard), `${file}:${job} must be upstream-only`);
    }
  }
});
