# Contracts — 002-zekoder-rebrand

## brand-module

- **Type:** internal. **Owner:** 01-brand-core. **Consumers:** 03-brand-surfaces (01 itself also uses it in server, CLI, app and protocol).
- **File:** `packages/protocol/src/branding.ts`, imported as `@getpaseo/protocol/branding` (needs `npm run build:client`).

```ts
export const BRAND = {
  name: "Zekoder",
  websiteUrl: "https://zekoder.net",
  deepLinkScheme: "zekoder",
  defaultDaemonPort: 6777,
  defaultHomeDirName: ".zekoder",
} as const;

/** `brandUrl()` -> "https://zekoder.net"; `brandUrl("/docs/cli")` / `brandUrl("docs/cli")` -> "https://zekoder.net/docs/cli". Fragments and queries pass through. */
export function brandUrl(path?: string): string;
```

Rules:
- Constants only. No zod schema, no wire type, no import from other protocol modules (keeps it cycle-free and
  importable from `ssh-transport.ts` and `agent-deep-link.ts`).
- Adding a field is fine; renaming or removing one breaks 03. Bundle ids live in `app.config.js` and
  `electron-builder.yml` literals, not here, because those files cannot import a TypeScript build output.
