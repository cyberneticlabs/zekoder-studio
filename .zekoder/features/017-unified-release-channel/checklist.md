# Unified release channel and update-restart notice — Checklist

## Feature-level gates

- [ ] Bug 013-release-channel-change-not-propagated merged first
- [ ] All packages merged (before feature 016 package 01)
- [ ] Full quality-gate suite green on the base branch (see this.md → Quality gates)
- [ ] get-started.md walkthrough executed end-to-end

## Package 01 — daemon-channel

- [ ] `releaseChannel` optional on the wire, always returned by a capable daemon; `features.releaseChannel` COMPAT-tagged
- [ ] Store persists and broadcasts the field; one-time seed from `desktop-channel.json` COMPAT-tagged
- [ ] Updater uses the config channel and re-checks on change
- [ ] docs/plugins.md channel bullets rewritten in place

## Package 02 — app-channel-and-restart

- [ ] Per-host control in Connected hosts, gated on capability; old host shows update hint
- [ ] Desktop Release channel row only when there is no local host; local host channel mirrored to desktop settings
- [ ] Restart-ready callout (web/desktop) and host-page Alert (all platforms), visible within about 1-2 min of staging; confirmation before restart; no auto-restart
- [ ] Restart confirm copy matches real behavior (agents stop, history kept) in every locale

## Package 03 — plugin-channel

- [ ] No check runs before `host` is set; skills channel from daemon config (`beta` → `dev`); legacy setting on old daemons
- [ ] Legacy `dev` migrates the host to Beta once
- [ ] Version tab read-only channel (capable vs old daemon wording); reconnect note after background install
- [ ] README + docs/zekoder-plugin.md updated; plugin version bumped
