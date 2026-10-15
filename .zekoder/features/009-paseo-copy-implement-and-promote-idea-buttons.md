---
id: 009-paseo-copy-implement-and-promote-idea-buttons
type: feature
title: "Paseo Issues: copy-implement-command and promote-idea buttons"
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:17.028Z
updatedAt: 2026-10-15T15:20:53.384Z
completedAt: 2026-10-15T15:20:53.384Z
branch: feature-009-paseo-copy-implement-and-promote-idea-buttons
promoted: false
dependsOn: []
packages: []
contracts: []
filesTouched:
  - plugins/zekoder/README.md
  - plugins/zekoder/client/issue-detail.tsx
  - plugins/zekoder/index.server.ts
  - plugins/zekoder/package.json
  - plugins/zekoder/server/zekoder.ts
  - plugins/zekoder/shared/issues.ts
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:20:53.384Z
---
> Imported from cyberneticlabs/zekoder-plugins feature 019-paseo-copy-implement-and-promote-idea-buttons (feature 008-plugin-source-consolidation).

# Feature 009-paseo-copy-implement-and-promote-idea-buttons: Paseo Issues: copy-implement-command and promote-idea buttons

> **Light-tier plan.** One area (`plugins/zekoder/`), one branch, one document.

## User's request (verbatim)

> in the paseo zekoder plugin in the issues wokrspace, add a copy button to copy the implement plan command i.e. `/zekoder-implement 040-...*` just next to the start button for convenience
> also another button to promote an idea into.a full plan (gated by followup 040)

Clarified: the "start button" is `ImplementButton` in `plugins/zekoder/client/issue-detail.tsx`. The
promote button must not ship before followup `040-idea-promotion-to-feature-adr-followup` has landed
on main.

## Refined scope

1. **Copy button** next to Implement in the detail panel. It copies exactly `/zekoder-implement <id>`
   (Claude slash form, the same string `implementIssue` sends as the prompt). It shows for the same
   types as Implement (`EXECUTABLE_TYPES`). It stays **enabled for every status**, unlike Implement.
   Reason: `/zekoder-implement` also resumes `in-progress` items, so copying it to run by hand is
   useful even when the one-click start is disabled.
2. **Promote button** in the detail panel of `idea` items. It starts a Claude agent in the project's
   workspace that runs the promotion entry point followup 040 settles, then opens that agent. It is
   the same pattern as Implement (`implementIssueRpc`).

## Out of scope

- Designing promotion itself: entry point, the idea's status afterwards, relation carry-over. Owned
  by followup 040.
- Making ideas listable or openable in Paseo. Bug 034 does that (it adds `idea` to `ITEM_TYPES`).
- Codex command forms, MCP server changes, a copy button for the promote command, toasts.

## Approach

Everything below is inside `plugins/zekoder/`.

- **Clipboard:** use `copyText(text): Promise<void>` from `@getpaseo/plugin/client/react-native`
  (declared in `node_modules/@getpaseo/plugin/dist/client/react-native.d.ts`). Do not use
  `navigator.clipboard` or React Native's `Clipboard`. The Paseo host owns the clipboard, and
  `copyText` rejects when copying is unavailable or denied, so show that error inline.
- **Command string, one source:** add
  `export function implementCommand(id: string): string` (returns `` `/zekoder-implement ${id}` ``)
  to `shared/issues.ts`. Use it in `server/zekoder.ts` `implementIssue`'s `prompt` and in the copy
  button, so both always send the same string.
- **Layout:** in `IssueDetail`, place `ImplementButton` and the new `CopyCommandButton` in one
  `View` with `flexDirection: "row", gap: 8`. Keep `ImplementButton`'s helper and error text under
  its button. Reuse `client/button.tsx` `Button` (not primary, icon `Copy`). The label shows
  `Copied` for about 2s after a successful copy, then goes back to `Copy command`.
- **Promote server path:** `implementIssue` already picks a model, opens the workspace and creates
  the agent (`server/zekoder.ts`, the lines after `canImplement`). Move that part into a private
  `startAgent(paseo, root, title, prompt)` helper so `implementIssue` and a new `promoteIdea` both
  call it. `promoteIdea` re-reads the item with `zekoder_get_item {itemType: "idea", cwd: root}` and
  throws unless `canPromote` passes, the same stale-UI guard Implement has.
- **Promote contract** in `shared/issues.ts`: `canPromote(type, status)` (type `idea` plus the
  statuses 040 allows), `promoteCommand(id)` (the 040 entry point), and
  `promoteIdeaRpc = defineRpc({name: "zekoder.issues.promote", input: {root, id}, output: {agentId, workspaceId}})`.
  Register the handler in `index.server.ts` next to `implementIssueRpc`.
- **Promote client:** add a `PromoteButton` in `issue-detail.tsx`, modelled on `ImplementButton`
  (useMutation, `navigation?.openAgent`, pending/started labels, inline error). Icon `Sparkles`
  (already used in `issue-row.tsx`'s `TYPE_ICONS`, so the host is known to render it). Render it
  when `type === "idea"`. This needs bug 034's `idea` in `ItemType`.

**Open assumption, confirm at execution:** 040's promotion can start from one command an agent
runs as its first prompt (for example `/zekoder-plan <idea-id>` or `/zekoder-promote <idea-id>`).
The target type (feature, ADR or followup) may be asked by the agent in chat; the button does not
choose it. Take the exact command, the eligible idea statuses and the button label from 040's
**landed** skill/command and docs. Do not use these example strings. Stop and report only if 040's
entry point cannot start from a single first prompt.

**Re-review gate:** once 040 lands, run a quick light re-review of this plan against 040's landed
entry point before queuing it.

## Related work considered

- **Followup `040-idea-promotion-to-feature-adr-followup`** (planned). Blocking dependency: it
  defines the command the promote button runs. The registry's `dependsOn` accepts feature ids
  only (the server rejects a followup or bug id), so both blockers are recorded as relations, and
  the gate is the **Precondition** task below. Do not queue this item before both have merged.
- **Bug `034-captured-ideas-missing-from-open-and-paseo`** (planned). Also a blocking dependency, gated the same way.
  Today `ITEM_TYPES` has no `idea`, so `getIssueRpc` rejects idea rows and no idea detail panel
  exists to host the button. Overlaps `shared/issues.ts` and `issue-detail.tsx`. **Separate, not
  folded**: it is a promoted, cross-package fix (MCP server, skill, harness trees).
- Other open items (018, followups 019/030/041/042/043) do not touch `plugins/zekoder/client` or
  `shared/issues.ts`. Feature 018 touches only Paseo's config panel.
- Decisions: none relevant found.

## Tasks

- [ ] **Precondition.** Check base-branch contents, not registry status (registry `merged` is
      written at staging-branch squash, before the batch reaches main). (a) Bug 034:
      `ITEM_TYPES` in `shared/issues.ts` on the base branch contains `idea`. (b) Followup 040:
      its promotion entry-point file (the skill or command it adds, e.g. under
      `packages/zekoder/skills/` or `packages/zekoder/commands/`) exists on the base branch.
      Either missing: stop and report `blocked`. Otherwise read 040's landed entry point: command,
      eligible idea statuses, button wording, and what happens to the idea afterwards.
- [ ] `shared/issues.ts`: add `implementCommand(id)`, `canPromote(type, status)`,
      `promoteCommand(id)` (040's command) and `promoteIdeaRpc`. Give each a one-line doc comment,
      like the existing ones.
- [ ] `server/zekoder.ts`: move `implementIssue`'s model/workspace/agent part into `startAgent`, and
      make `implementIssue` use `implementCommand(input.id)`. Add `promoteIdea` (status re-check,
      title `Promote ${id}`, prompt `promoteCommand(id)`). Register it in `index.server.ts`.
- [ ] `client/issue-detail.tsx`: add `CopyCommandButton` (uses `copyText(implementCommand(id))`,
      shows `Copied` state and an inline error), placed in a row with `ImplementButton`.
- [ ] `client/issue-detail.tsx`: add `PromoteButton` for `type === "idea"`, enabled by
      `canPromote(type, issue.status)`. When disabled, show one helper line that names the statuses
      that can be promoted.
- [ ] `README.md`: after the **Implement** bullet, add one sentence on the copy button and one
      **Promote** bullet. Bump `package.json` `version` one minor step above the value on the base
      branch at execution time (Implement's commit `387ee68` also bumped it). Do not touch
      `package-lock.json`.

## Verification

- `cd plugins/zekoder && npm ci && npm run typecheck`: passes.
- ``grep -n '`/zekoder-implement ${' plugins/zekoder/server/zekoder.ts plugins/zekoder/client/*.tsx plugins/zekoder/shared/issues.ts``:
  the template literal appears only inside `implementCommand` in `shared/issues.ts`. Doc-comment
  mentions of `/zekoder-implement` are allowed.
- Live check, pending-human (README "Develop and install": `paseo plugin install "$PWD"` /
  `paseo plugin reload zekoder` from `plugins/zekoder`). Check four things:
  1. On a planned feature, Copy puts exactly `/zekoder-implement <id>` on the clipboard.
  2. Copy also works on an `in-progress` item, where Implement is disabled.
  3. On an eligible idea, Promote starts a `Promote <id>` agent whose first prompt is 040's command,
     then jumps to that agent.
  4. On a non-eligible idea, Promote is disabled.
  5. The copy button's `Copy` icon renders (`Icon` accepts any name string, so a wrong name fails
     silently). If it does not render, switch to `FileText`, already used in `issue-detail.tsx`.
  The coding agent reports this check as pending-human. It never installs or reloads plugins.

## Related in other repos

- relatedFeatures: [feature/015-idea-item-type](https://github.com/cyberneticlabs/zekoder-mcp/blob/main/.zekoder/features/015-idea-item-type/Overview.md) (zekoder-mcp)
- relatedBugs: [bug/034-captured-ideas-missing-from-open-and-paseo](https://github.com/cyberneticlabs/zekoder-mcp/blob/main/.zekoder/bugs/034-captured-ideas-missing-from-open-and-paseo/Overview.md) (zekoder-mcp)
- relatedFollowups: [followup/040-idea-promotion-to-feature-adr-followup](https://github.com/cyberneticlabs/zekoder-skills/blob/main/.zekoder/followups/040-idea-promotion-to-feature-adr-followup.md) (zekoder-skills)
