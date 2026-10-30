# Network Recovery Implementation Plan

> Implement inline with focused TDD; no subagents or model changes.

**Goal:** Diagnose transport failures without exposing credentials and recover a missed weekly refresh without waiting another week.

**Architecture:** Keep current collectors, final gates, data contracts and Pages deployment. Add bounded slower request retries and a scheduled decision before collection. Preserve the Wednesday full refresh; other days only recover failures, ignoring verification-only and skipped jobs when deciding whether data was successfully published.

**Tech Stack:** Node standard library and existing GitHub Actions.

**Spec:** User request on 2026-10-30 to distinguish our defects from provider failures and fix our side. Oct28 logs prove NETWORK only, not the underlying network cause. Oct30 real verification succeeds with unchanged code/key.

## Constraints

- No changed source definitions, fake zero results, weakened final checks, new hosting, secrets or UI changes.
- Log only allowlisted network codes, phase, service, page and attempt counts; never URLs, addresses, raw exceptions, bodies or keys.
- Four request attempts at most, with default waits of 5, 30 and 60 seconds. Authentication/schema/no-data failures do not gain retries.
- Original product checkout remains untouched. Work only in the clean operations branch.

## Tasks

- [ ] Write and observe failing request diagnostics/backoff and scheduled-recovery tests.
- [ ] Implement request diagnostics, bounded backoff, and propagation through the quarter resolver.
- [ ] Implement the daily catch-up decision and wire conditional collection into the existing weekly workflow.
- [ ] Run all existing build/map tests, injected failures/recovery, syntax and diff checks.
- [ ] Push a scoped branch; run real verification-only collection with registered Secrets.
- [ ] Promote verified changes without rewriting history; run actual main refresh and verify data commit and Pages publication.

## Review Focus

- Do not blame a provider based on a generic NETWORK error.
- TLS/configuration failures must not be retried as transient transport failures.
- Verification-only and skipped runs cannot clear an unresolved refresh failure.
- Successful manual publication must stop the next catch-up from repeating collection.
- Wednesday always performs normal refresh, even if the previous week was healthy or the runner starts late.
