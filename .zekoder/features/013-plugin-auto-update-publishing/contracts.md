# Plugin auto-update publishing — Contracts

## plugin-release-channel

- **Type**: cross-system
- **Counterpart**: cyberneticlabs/zekoder-studio feature 004-plugin-auto-update (consumer: overlay loader + verifier)
- **Owner**: 01 — this repo OWNS the format; Studio consumes it. Changes Studio must make vs its draft are listed in external dependency 3.
- **Consumers**: none in this repo
- **External dependency**: 3

### GCS paths (bucket `zekoder-releases`, project `zekoder-484012`)

| Object | Path | Mutability | Cache-Control |
|---|---|---|---|
| Signed manifest envelope | `plugins/zekoder/manifest.json` | rewritten per release/revoke, generation-match CAS | `public, max-age=60` |
| Release artifact | `plugins/zekoder/releases/vX.Y.Z[-beta.N]/zekoder-plugin-vX.Y.Z[-beta.N].tar.gz` | immutable, `--no-clobber`, never overwritten or deleted (also after revoke) | `public, max-age=31536000, immutable` |

Public URL prefix: `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/`. Readers reject any artifact URL outside that prefix and always use the `url` from the manifest (never build it). `releases/` (skills/MCP) and `desktop/` (Studio 003) are never written.

### Tags and channels

- Stable: `^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`. Beta: same core + `-beta\.(0|[1-9][0-9]*)$`. Anything else fails the pipeline.
- `version` = tag without `v`. It equals `plugins/zekoder/package.json` version and `PLUGIN_VERSION`.

### Artifact layout

- gzip-compressed tar, regular files and directories only (no symlinks, no absolute paths, no `..`).
- Single root directory `zekoder/`, holding exactly the `plugins/zekoder/package.json` `files` entries (so `zekoder/paseo-plugin.json` with `id: "zekoder"`) — the same tree `scripts/sync-zekoder-plugin.mjs` vendors into Studio `plugins/zekoder/`.
- `treeChecksum` = Studio's `computeTreeChecksum` over the extracted `zekoder/` dir: files sorted by `/`-joined relative path; for each, sha256-update `"<path>\0<byteLength>\0"`, the bytes, then `"\0"`; lowercase hex. Same value Studio's lock `checksum` holds for a vendored tag.

### Envelope (`plugins/zekoder/manifest.json`)

```json
{
  "schemaVersion": 1,
  "payload": "ewogICJzY2hlbWFWZXJzaW9uIjogMSwK...",
  "signatures": [{ "keyId": "zk-plugin-2026-10", "alg": "ed25519", "sig": "q83vEjRWeJA...==" }]
}
```

- `payload` = standard base64 of the exact UTF-8 payload bytes. `sig` = standard base64 of the 64-byte signature.
- Signature = Ed25519 (RFC 8032, pure) over the decoded payload bytes. No JSON canonicalization: verify the bytes, then `JSON.parse` them.
- Valid when at least one entry has `alg: "ed25519"`, a `keyId` in the reader's keyring, and verifies. Unknown key ids are ignored. Zero valid → reject the whole manifest (`signature-invalid`).
- **Why one envelope, not a detached `manifest.json.sig`**: one object = one atomic write. Two objects can be read out of step during a publish (CDN/cache skew, 60 s max-age) and give a spurious `signature-invalid`.
- The publisher writes exactly one signature today. `signatures[]` + `keyId` are a format hook for a future rotation; dual-signing is not built (rotation runbook: followup `002-plugin-signing-key-rotation`).

### Payload (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "pluginId": "zekoder",
  "sequence": 12,
  "publishedAt": "2026-10-07T12:00:00Z",
  "channels": { "stable": "0.12.0", "beta": "0.13.0-beta.1" },
  "releases": {
    "0.12.0": {
      "version": "0.12.0", "tag": "v0.12.0", "channel": "stable",
      "commit": "380f37b044eb5591ae551773256c5a915d7bc5f0", "publishedAt": "2026-10-07T12:00:00Z",
      "artifact": { "url": "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/releases/v0.12.0/zekoder-plugin-v0.12.0.tar.gz",
                    "sha256": "9f2c4e0d7a1b5c3e8f6a2d4b1c7e9a0f3d5b8c2e4a6f1d3b5c7e9a2f4d6b8c0e", "size": 123456 },
      "treeChecksum": "1b15aeccbfd8c9eb7381b9c651b5b5958bbb342e78bc0a6b66a75ca52ff43c97",
      "requires": { "paseo": ">=0.9.2" }
    }
  },
  "revoked": [{ "version": "0.12.1", "reason": "breaks issue list", "revokedAt": "2026-10-08T09:00:00Z" }]
}
```

- `sequence`: positive integer, +1 on every manifest write (release or revoke). Readers persist the highest verified value; lower → reject with `sequence-replay`; equal → no-op; higher → accept and persist.
- `releases`: keyed by version, never deleted or changed once added. Identity of an entry = `artifact.sha256`, `artifact.size`, `treeChecksum`, `commit`, `requires` (not `publishedAt`). Same identity on re-run → no-op; different → abort.
- `requires.paseo`: copied from `plugins/zekoder/paseo-plugin.json` `requirements.paseo` at the tagged commit (the source file keeps its own key name). **Checked against the Paseo daemon version** (Studio `resolveDaemonVersion()`, `packages/server/package.json`), never the desktop app version; `semver.satisfies`, a prerelease daemon matches its stable core.
- `channels.stable` = highest non-revoked stable version; `channels.beta` = highest non-revoked of stable ∪ beta; `null` when none. Informational (ignores compat).
- `revoked`: append-only list of `{version, reason, revokedAt}`. A revoked version must never be loaded, even if already downloaded. (Informational: Studio stores revoked state internally as a list of version strings; the manifest wire format stays objects.)

### Reader selection (Studio side, normative)

Eligible = releases with channel `stable` (stable app) or `stable|beta` (beta app), not revoked, `requires.paseo` satisfied by the daemon version, and semver greater than the bundled version. Pick the highest; none → bundled. Download, check `sha256` and `size`, extract, check `treeChecksum`, stage for next daemon start.

### Keyring

`scripts/plugin-release-keys.json` (committed, public keys only):
`{ "keys": [{ "keyId": "zk-plugin-2026-10", "alg": "ed25519", "publicKey": "<standard base64 of the raw 32-byte Ed25519 public key>", "addedAt": "2026-10-07" }] }`.
This is Studio's `TrustedKey {keyId, publicKey}` plus two extra fields; Studio embeds a copy. No PEM. Key id format `zk-plugin-YYYY-MM`. Node import: `createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: <base64url of the 32 bytes> }, format: "jwk" })`. CI verifies the current manifest with this keyring before writing a new one.

## builtin-plugin-update-status

- **Type**: cross-system
- **Counterpart / owner**: cyberneticlabs/zekoder-studio feature 004 — Studio **owns and implements** this API (user decision); Studio contract id `builtin-plugin-update-status`, Studio types prefixed `BuiltinPluginUpdate*` (e.g. `BuiltinPluginUpdateStatus`). This repo only consumes it. Shape below is **final and confirmed** by Studio.
- **Owner in this plan's metadata**: `external` (Studio 004). No open requests on this contract (external dependency 4).
- **Consumers**: 02 (Version tab card)
- **External dependency**: 4

### Naming

| Layer | Name |
|---|---|
| Plugin-facing call (`PaseoApi`, `context.paseo` in `server.handle` handlers) | `paseo.pluginUpdates.status(pluginId: string)` (Studio's signature; plain string) |
| Wire | `plugin.updates.get_status.request` → `plugin.updates.get_status.response` |
| Capability flag | `server_info.features.pluginUpdates?: boolean` |

Package 02 calls `paseo.pluginUpdates.status("zekoder")` (plain string argument). Studio returns `BuiltinPluginUpdateStatus[]`; 02 picks the entry with `pluginId === "zekoder"` and still parses tolerantly: a single object, an array, or `null`/`undefined` (= not reported). It feature-detects the `status` method, not the flag. There is no restart method: the plugin **never** restarts anything; the user restarts from Studio (Settings → Host → Restart daemon).

### Shape as consumed (Studio-owned, flat, confirmed)

Plugin-local type may mirror Studio's name.

```ts
type BuiltinPluginUpdateStatus = {
  pluginId: string;                        // required
  runningVersion: string;                  // required: what this daemon actually started
  source: "bundled" | "downloaded";        // required
  stagedVersion?: string | null;           // optional: verified download that loads on next daemon start
  restartRequired?: boolean;               // optional: next start runs a different version than now (incl. rollback to bundled after a revoke)
  fallbackReason?: string | null;          // optional; known: start-failed | revoked | previously-failed | incompatible
  lastCheckAt?: string | null;             // optional, ISO-8601
  lastError?: { code: string; message: string; at: string } | null;  // optional
  bundledVersion?: string;                 // optional
  latestAvailable?: string | null;         // optional: version string
  channel?: "stable" | "beta";             // optional: set by the desktop app; display only
  enabled?: boolean;                       // optional; false = updates off (incl. daemon not launched by the desktop app)
};
```

- Restart needed = `restartRequired` when present (final semantics: true whenever the next start would run a different version than now, including rollback to bundled after a revoke); fallback only when absent: `stagedVersion && stagedVersion !== runningVersion`. The plugin shows "Restart the daemon to apply (Settings → Host → Restart daemon)"; it never restarts.
- `enabled: false` = updates off, including a daemon not launched by the desktop app (headless npm/Docker, dev, CI, smoke). The plugin shows "Updates are managed by the desktop app".
- Channel (stable/beta) comes from the desktop app, not a plugin setting; the plugin only displays `channel`.
- Downloaded version that fails to start: Studio retries once on the next start, then marks it failed until a newer version ships → `fallbackReason: "previously-failed"`.
- All codes are open strings on the wire. The plugin shows unknown codes and reasons verbatim; unknown fields are ignored.

### Error codes (`lastError.code`, open string)

Studio's list: `manifest-fetch-failed, manifest-invalid, signature-invalid, sequence-replay, incompatible, revoked, download-failed, sha256-mismatch, unpack-failed, start-failed`.
Requested additions (the manifest carries `artifact.size` and `treeChecksum`, Studio should verify both): `size-mismatch`, `tree-checksum-mismatch`.

`fallbackReason` known values: `start-failed | revoked | previously-failed | incompatible`.

## plugin-version-constant

- **Type**: internal
- **Kind**: store
- **Owner**: 01
- **Consumers**: 02
- **Signature**: `plugins/zekoder/shared/plugin-version.ts` → `export const PLUGIN_VERSION = "0.12.0";` (string literal on one line; the release script reads it by regex and fails when it differs from the tag).
