# Data refresh operations

## Normal operation

- `Update Living Population` runs weekly on Tuesday 21:30 UTC, Wednesday 06:30 KST. GitHub may delay scheduled jobs.
- The job selects the newest quarter actually published by every required commercial feed, never earlier than the committed view quarter. A calendar quarter is not evidence of publication.
- Daily population starts four days before today in KST and searches at most seven additional days. Only a validated `INFO-200` permits trying an earlier date. An explicit date or quarter never silently falls back.
- Ten confirmed Seoul services return history despite quarter parameters. Full pagination is validated before selecting the requested quarter.
- All 17 commercial sources, the 25-gu daily feed, exact core totals, search derivative, coverage, source-period labels and map references must pass before one data commit is made. The existing 80% row/area retention guard remains mandatory.
- After a changed data commit on `main`, request a rebuild of the existing GitHub Pages site and wait at most ten minutes for that exact commit to report `built`. Branch tests, limited samples and verification-only runs do not deploy. The helper refuses hosting settings other than the already-configured legacy `main /`; it never changes hosting configuration.
- `Update Store Data` is manual. Review the public provider's publication notice monthly and run a complete refresh after a new snapshot is available. This is an operating review policy, not a claim about the provider's publication schedule.
- Other manually imported datasets retain their actual source dates. Review their source notices monthly; do not relabel old data with today's build date. Their importers are not invoked by these two workflows.

## Safe execution

1. Open the appropriate workflow under GitHub Actions. Leave date/quarter blank for normal publication discovery.
2. Run with `verify_only=true` first. This uses real credentials and complete collection, but skips the data commit.
3. Inspect the selected quarter, daily date/25 gu, final snapshot report and retention guard. Investigate any loss; do not lower a guard merely to obtain a green run.
4. Run again with `verify_only=false` to publish. Inspect the resulting data commit and, on `main`, the verified Pages rebuild. Verify any separately hosted application actually imports this snapshot; this does not redeploy the independent ChatGPT Sites trial.

For store API smoke tests, specify `limit_gu` and/or `max_pages`. These runs write only to the runner's temporary sample file, skip derivative generation and never commit. They do not prove full Seoul collection.

## Failure handling

- Missing publication: normal default selection may choose the prior already-approved period. If no common period is available at or above baseline, stop and retain committed data.
- Network timeout, HTTP 5xx or Seoul `ERROR-500`: bounded retry, then fail. Authentication, schema, duplicate identity, incomplete pages and unstable totals fail closed.
- Inspect the first failed step and its service/period/error code. Never print credential URLs or raw provider error bodies.
- Correct the demonstrated cause on a branch, run tests, then run a real `verify_only` workflow. A local mock test alone is not an operational recovery check.
- Failed jobs do not run the final commit step. Preserve the last accepted repository snapshot. Independent hosting rollouts must preserve their own last good deployment.
- The two workflows share a per-branch concurrency group and do not cancel an active refresh.

## Existing Pages connection

GitHub documents that commits made with `GITHUB_TOKEN` do not automatically trigger a Pages build. The explicit rebuild uses the existing site's REST API, not a new deployment platform or a new secret.

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build

If the final rebuild step fails, the accepted data commit may already exist; distinguish data import success from site publication failure. Inspect the build before requesting another one. A successful verification-only run never verifies publication.

## Recovery evidence, 2026-10-16

- Original failed schedule: https://github.com/papa6229-beep/seoul-jari/actions/runs/38490473581 . The collector accepted empty candidates for unpublished dates/quarters before an upstream XML `ERROR-500` stopped the job. No data commit was made by that failed run.
- First real recovery check: https://github.com/papa6229-beep/seoul-jari/actions/runs/38873558479 . The new resolver rejected a history-returning resident-population feed; this exposed the incomplete history-service allowlist, which was then expanded using actual sample responses and stored snapshots.
- Isolated store authentication smoke test: https://github.com/papa6229-beep/seoul-jari/actions/runs/38873753675 . Succeeded; no canonical data commit.
- Complete real-source verification: https://github.com/papa6229-beep/seoul-jari/actions/runs/38873974523 . Succeeded for quarter `20262`, 425 view dongs, 105 industry types and daily population `20261012` across 25 gu. Checked 17 commercial feeds, 733 place files, 427 store shards / 435,683 points, exact core consistency and the existing 19-dataset retention guard. Commit was deliberately skipped.
- Accepted branch publication: https://github.com/papa6229-beep/seoul-jari/actions/runs/38874775790 . Succeeded through the automatic data commit `1696a91`. The accepted snapshot was fetched back and independently passed the final disk and 19-dataset retention checks.
