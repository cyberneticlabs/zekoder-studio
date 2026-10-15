# Contracts

## user-install-v1

Type: cross-system. Owner:01. Counterpart: cyberneticlabs/zekoder-skills. External dependency:1.

Execute Node with argv arrays and an explicit calling cwd; never a shell:
- node RELEASE_ROOT/scripts/install.mjs status --json [--project ABS_ROOT] [--mcp-home ABS_HOME]
- node RELEASE_ROOT/scripts/install.mjs install-user --harnesses CSV --json [--mcp-home ABS_HOME]
- node RELEASE_ROOT/scripts/install.mjs migrate-project --project ABS_ROOT --json [--mcp-home ABS_HOME] [--dry-run]

Probe active/candidate CLI before mutations; require schemaVersion1 plus capabilities containing user-install-v1. Missing script, wrong/malformed JSON or unsupported modes -> installer upgrade needed, never legacy project-install/Bash fallback.
Exit0 means readable result, not readiness;1 operational error;2 unsupported/usage;3 retryable shared lock contention. JSON stdout only, diagnostics stderr. Nonzero JSON when available: {schemaVersion:1,capabilities:["user-install-v1"],error:{code,message},diagnostics:string[]}; also handle absent/non-JSON legacy output.

Status/result:
- schemaVersion:1; capabilities:string[]; scope:"user"|"project".
- installation:{state:"not-installed"|"current"|"degraded",releaseVersion?:string,mcpVersion?:string,sourceRoot?:string}.
- runtime:{mcpBundle?:string,orgHealthBundle?:string,materializer?:string,agentsSourceRoot?:string,codexPreamble?:string}; present paths absolute and verified.
- harnesses:{id:string,state:"ready"|"missing"|"unsupported"|"conflict",paths:string[],reloadRequired:boolean,diagnostics:string[]}[].
- project:null|{root:string,state:"ready"|"legacy"|"conflict",legacyPaths:string[],conflicts:string[],migrationRequired:boolean}.
- diagnostics:string[]; changedPaths?:string[] (mutation result requires changedPaths).

Status and dry-run perform no writes/MCP auto-init or receipt updates. Status reports pending/interrupted transactions through existing diagnostics while describing the verified active runtime truthfully; no new state enum is added. Recovery runs under the shared lock during install-user or migrate-project mutation, retaining the old runtime until verified commit. Successful migrate-project --dry-run returns predicted changedPaths containing only proven-owned paths that would change; conflicts remain separate and no bytes change. Successful applied mutations return actual committed changedPaths, not predictions. Verify bytes, ownership/native wiring; receipt/stamp alone insufficient. Unknown harness states remain unready. Project with missing required harness is conflict; migrationRequired only when legacy paths exist. Reload guidance is conservative, not proof a running session refreshed.
User install includes selected harnesses plus preserves existing installed harnesses; status truthfully reports unsupported/native policy restrictions. OMP/OpenCode remain explicit opt-in.
Migration only changes proven unchanged owned files/exact owned config entries under the selected root; outside ancestors/main-checkout shadows remain report-only conflicts. Preserve .zekoder data/config/repoId and local generated variants; never untrack or commit removed assets.

Activation convention to confirm with skills owner: candidate CLI derives candidate sourceRoot from its executable location. Plugin forwards the existing resolved ZEKODER_CACHE_DIR (deprecated SKILLS_CACHE_DIR fallback, then ~/.cache/zekoder-skills) as the active destination; no new argv mode/flag. Installer owns lock, prior-state snapshot, payload publication, wiring and receipt commit/rollback. Failure keeps old payload, ownership and wiring usable; returned runtime/changedPaths describe only verified committed state. Status invoked from candidate must identify active installation rather than label candidate bytes installed.
MCP home is independent: explicit --mcp-home, environment ZEKODER_MCP_HOME, then ~/.zekoder-mcp; durable installer ownership under installation/. Preserve all override meanings.
Canonical Claude/Codex sources use runtime.agentsSourceRoot; OMP/OpenCode use sourceRoot/dist/harnesses/HARNESS/.HARNESS/agents, never canonical Markdown as native content. Variant identity includes rendered definition/preamble inputs; outputs stay session-project local with existing eight-hex filename shape. MCP-emitted commands must agree (dependency2).
