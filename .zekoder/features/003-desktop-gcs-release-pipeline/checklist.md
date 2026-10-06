# Desktop release checklist

## Feature gates

- [ ] Packages 01–03 merged and implementation format/typecheck/lint pass.
- [ ] Focused suites green; full suites validated in CI only.
- [ ] external-dependencies.md owners confirm readiness; no upstream publish/update endpoint remains in fork release path.
- [ ] Authorized tag walkthrough executed for stable and beta, including real update/install and Markdown notes.
- [ ] All five targets have complete immutable signed/notarized payloads where required, stored hashes and matching version; catalog publication last is proven.

## Package 01

- [ ] Strict versions, matrix, notes, provenance and stored-bytes validation.
- [ ] Partial upload, immutable replay, CAS race and out-of-order cases covered.

## Package 02

- [ ] Tag-only exact-source CI; no alternate ref/manual release.
- [ ] Fork credentials/signing; inherited publish guards; agent-only approved tagging instructions.
- [ ] High-level GitHub notes copied to GCS and draft finalization retryable.

## Package 03

- [ ] Catalog selects immutable OS/arch feed, exact channel and validated notes URL.
- [ ] Followup001 test restoration reviewed; no upstream request/downgrade.
- [ ] Native install/relaunch checks cover notarized macOS, Windows declared signing policy and AppImage.
