# Zekoder Suite: branded Paseo distribution

Status: proposal for implementation planning.

## Objective

Ship branded desktop and mobile applications. Bundle Zekoder plugins and theme. Add product login and onboarding. Preserve long-term compatibility with upstream Paseo.

Keep fork changes small and isolated. Prefer supported plugins and configuration. Preserve upstream execution and transport behavior.

## Repository and branch strategy

| Location                         | Responsibility                                |
| -------------------------------- | --------------------------------------------- |
| `cyberneticlabs/zekoder-suite`   | Branded application distribution              |
| `~/Code/zekoder/apps`            | Local checkout                                |
| `origin`                         | Cybernetic Labs fork                          |
| `upstream`                       | `https://github.com/getpaseo/paseo.git`       |
| `main`                           | Branded integration and release baseline      |
| `feature/*`                      | Individual product changes                    |
| `sync/paseo-*`                   | Upstream integration and compatibility checks |
| `cyberneticlabs/zekoder-plugins` | Independently maintained product plugins      |

Keep one monorepo across platforms. Keep branded work on `main`. No separate permanent branding branch. Preserve upstream directories and internal names. Avoid repeatedly rebasing published branch history.

## Customization boundaries

| Concern                                    | Proposed home                                 |
| ------------------------------------------ | --------------------------------------------- |
| Names, icons, splash, application IDs      | Central branding configuration and assets     |
| Theme, panels, commands, workflows         | Versioned Paseo plugins                       |
| Login, onboarding, account state           | Isolated module with narrow application hooks |
| Organizations, subscriptions, entitlements | Product backend services                      |
| Agent execution, protocol, pairing         | Upstream implementation                       |
| Signing, installers, update feeds          | Fork-owned release infrastructure             |

Use supported extension points first. Add narrow hooks where necessary. Propose reusable hooks to upstream. Keep product-specific behavior inside owned modules.

Do not assume hooks already exist. Validate boundaries against selected upstream revision.

## Plugin and theme delivery

Paseo installs plugins into individual daemons. Connected clients receive plugin contributions. Mobile packaging alone cannot provision hosts.

- Bundle exact, tested plugin artifacts.
- Provision desktop daemons during onboarding.
- Provide equivalent remote-daemon provisioning.
- Explain bundled plugin trust during onboarding.
- Keep provisioning repeatable across upgrades.
- Preserve user-installed plugins and configuration.
- Avoid floating Git branches during installation.
- Test plugin compatibility before each release.

Keep product plugins independently versioned. Record versions inside each release manifest. Include upstream commit and artifact checksums.

Provide startup branding before daemon connection. Apply theme plugins after plugin availability. Validate startup and disconnected appearance separately.

## Login and authorization

Product login establishes account identity. Machine pairing establishes daemon access. Preserve upstream pairing and transport encryption.

Use OIDC authorization code with PKCE. Native clients use system browser login. Store credentials through platform-secure storage. Enforce backend capabilities within backend services.

UI gates provide no backend authorization. Provider credentials remain separately managed.

Mandatory daemon authorization changes this scope. It requires separate daemon enforcement design. Do not assume login provides isolation.

Reuse existing daemon principals and grants. Review [daemon permissions](docs/permissions.md) before integration. Current permissions apply across whole daemons. Shared execution needs explicit isolation design.

Resolve before implementing authentication:

- Identity provider and client registrations.
- Optional versus mandatory account login.
- Offline behavior and token expiry.
- Organization selection and entitlement rules.
- Logout, revocation, and daemon access semantics.
- Personal machines versus shared execution hosts.

## Distribution ownership

Use distinct identifiers across supported platforms. Own signing certificates and store listings. Publish through fork-controlled update channels.

- Separate bundle IDs and URL schemes.
- Separate application data and daemon ports.
- Configure dedicated `PASEO_HOME` location.
- Audit pairing links and callback URLs.
- Audit relay and download endpoints.
- Choose explicitly which services remain external.
- Prevent branded updates installing upstream binaries.
- Use owned namespaces for published packages.
- Audit inherited CI publishing before enabling.

Preserve license and applicable attribution notices. Mark modified files where licensing requires. Review bundled dependencies before distribution.

## Upstream maintenance workflow

1. Fetch changes from `upstream` regularly.
2. Select tested upstream release or commit.
3. Create `sync/paseo-*` from branded `main`.
4. Merge selected upstream revision normally.
5. Resolve conflicts within customization boundaries.
6. Run build and compatibility checks.
7. Review and merge integration PR.
8. Publish through branded release channels.

Merge sync PRs preserving upstream ancestry. Enable merge commits for these PRs. Squashing integration loses recorded upstream ancestry.

Automate discovery and integration PR creation. Keep release promotion behind passing checks. Track recurring conflicts and patch footprint. Refactor patches causing repeated integration failures.

Maintain compatibility matrix for supported releases. Include application, daemon, and plugin versions. Test supported mixed-version client/daemon combinations. Document unsupported combinations before release.

Preserve [upstream protocol compatibility](docs/protocol-compatibility.md). Gate new features through capability negotiation. Follow existing [release conventions](docs/release.md) where applicable. Replace upstream publishing destinations before releasing.

## Validation and recovery

Run upstream checks affected by changes. Add focused tests around custom boundaries.

- Desktop, web, and mobile build validation.
- Plugin loading and theme availability.
- Login, callback handling, refresh, and logout.
- Pairing and daemon reconnection.
- Existing workspace and configuration upgrades.
- Correct update channels and package identities.
- Fresh installation and repeatable plugin provisioning.

Keep previous signed artifacts available. Document application and plugin rollback procedures. Check migration compatibility before allowing rollback. Back up state before irreversible migrations.

## Delivery sequence

### Stage 1: establish baseline

- Build selected upstream revision unchanged.
- Record baseline versions and checks.
- Audit branding and deployment touchpoints.
- Validate existing Zekoder plugin compatibility.

### Stage 2: branded desktop prototype

- Introduce centralized branding configuration.
- Bundle existing plugin and theme.
- Isolate application state and update channels.
- Verify clean installation and startup.

### Stage 3: login integration

- Resolve authentication decisions listed above.
- Implement isolated login and account module.
- Integrate backend entitlement enforcement where needed.
- Verify pairing remains independently functional.

### Stage 4: rehearse upstream upgrade

- Integrate next suitable upstream revision.
- Measure conflicts and compatibility failures.
- Reduce recurring customization conflict points.
- Verify upgrade from previous branded build.

### Stage 5: expand distribution

- Add branded mobile and web releases.
- Provision plugins on remote hosts.
- Complete signing and release automation.
- Establish scheduled upstream integration checks.

## Initial acceptance criteria

- Branded desktop installs beside upstream Paseo.
- Bundled plugins load at pinned versions.
- Branding works before connecting any daemon.
- Login behavior matches agreed access policy.
- Existing pairing and execution remain functional.
- One upstream upgrade completes successfully.
- Release manifest identifies all bundled revisions.

## References

- [Paseo upstream](https://github.com/getpaseo/paseo)
- [Plugin architecture](https://paseo.sh/docs/plugins)
- [Configuration](https://paseo.sh/docs/configuration)
- [Security and pairing](https://paseo.sh/docs/security)
- [Update behavior](https://paseo.sh/docs/updates)
- [Native OAuth guidance](https://www.rfc-editor.org/rfc/rfc8252)
- [Upstream license](https://github.com/getpaseo/paseo/blob/main/LICENSE)
