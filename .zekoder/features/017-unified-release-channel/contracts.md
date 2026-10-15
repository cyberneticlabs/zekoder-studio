# Unified release channel and update-restart notice — Contracts

## daemon-release-channel

- **Type**: internal
- **Kind**: store
- **Owner**: 01
- **Consumers**: 02, 03
- **Signature / payload**:

  Protocol (`packages/protocol/src/messages.ts`), all additions optional on the wire:

  ```ts
  // MutableDaemonConfigSchema (~L174) and MutableDaemonConfigPatchSchema (~L214)
  releaseChannel: z.enum(["stable", "beta"]).optional()

  // server_info features (~L3600-3680)
  // COMPAT(releaseChannel): added in v0.12.0, remove after 2027-04-15.
  releaseChannel: z.boolean().optional()
  ```

  - Read: `client.getDaemonConfig()` → `config.releaseChannel`. A capable daemon **always** returns it, resolved as persisted value ?? one-time seed from `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json` ?? `"stable"`. **Absent means an old daemon**, never "unset".
  - Write: `client.patchDaemonConfig({ releaseChannel })`; broadcast `status:daemon_config_changed` as today. Permission is the existing `daemon.manage`.
  - Plugin access: `paseo.config.get()` / `paseo.config.patch()` (`packages/client/src/index.ts` ~L765). The plugin detects capability by `"releaseChannel" in config`.
  - App capability: `features.releaseChannel: true`. Without it, show "Update this host to change its channel" and write nothing.
  - Skills mapping (03): `stable` → zekoder-skills `stable`; `beta` → `dev`.
