# Worker cost remediation, issue #1

## Baseline and release boundary

This branch is for `thirddash4/ChatbotX#1`, against `baseline/worker-runtime-aec902c`.
Do not deploy the fork default branch, `b7994f9342b35f3de0db90078013dfde303721b7`, or merge this historical branch into it to build the release.
The original production source repository is `ChatbotXIO/ChatbotX`; this fork is the approved remediation repository.
The September upstream consolidation `1e62f18357fc560b63a0d7ef9d057d74edb595a4` supplied the approach, not an application upgrade.

Read-only inspection on 2026-10-12 recovered 1,277 distinct application sources from the active image's source maps.
Every SHA-256 matches `aec902c332e312ad16d4c124669209a2490cc9f3`.
The timestamp candidate `c11ccac863d6e5dda9824d42169cf36b109f0293` matches only 1,137 and differs in 140, including database definitions and worker handlers.
The selected base is therefore source-compatible with the bundled application.
Railway's CLI deployment metadata has no commit hash; this is not proof of the original Git SHA, unbundled files, build flags, or all dependency inputs.
The recovered runtime includes Node v24.19.0, BullMQ 5.78.0, ioredis 5.10.1 and tsdown 0.22.3.
The historical lockfile is unchanged; Node and the Docker prune tool now use explicit versions.
No database compatibility migration is introduced or needed for the unchanged bundled database source.
No database was queried or modified.

| Target | Value |
| --- | --- |
| Project | `8c2a6814-e702-4c3b-b085-b66d299497c7` |
| Environment | `production` / `562ec1d1-3405-464a-b7ba-9e7850be4ac0` |
| Worker service | `9a54b87e-2070-40ca-a826-68ed7d7745b6` |
| Active deployment | `d03fe708-11ac-440d-a87c-78f6cf43dfd1` |
| Active image digest | `sha256:5e6aadc4e5e9609a3d3e9e7d3d2d3126f02793e197a17b619c9de994abfdee58` |
| Observed instance | `0fd161d7-5f72-4570-b289-d2590e07713f` |
| Failed later deployment | `c2bb64ac-6982-4906-976a-b3ad1990b787` |
| Application | `https://chat.357baking.com` |

Active safe environment values are `NODE_OPTIONS=--max-old-space-size=1024` and `WORKER_DISABLE=ai-agent,sequence-consumer,sequence-producer,sequence-scheduler,trigger`.
No worker-concurrency overrides were present in the inspected environment.
Do not lower the heap limit or change these variables for this release.
The earlier 384 MB limit caused an outage; consolidation reduces duplicated dependency heaps instead.

One process RSS snapshot, in KiB, was chat 723584, default 359544, events 194144, integration 1189228, schedule 726592, webhook 164860.
These are point-in-time process RSS values, not a Railway billed-memory measurement or a savings forecast.
The parent-provided Railway memory baseline was approximately 3.507 GB mean.

Temporary SSH access was registered through the authenticated CLI and removed after inspection.
The CLI could not discover a scratch key by path; loading that unique key into a temporary SSH agent and selecting its comment worked.
Registration removal was verified; the private/public key files and temporary agent were removed.
No credentials, raw environment dumps, messages, contacts, or database records are retained here.

## Process behavior

`worker`, `worker standalone`, `worker core`, and legacy `worker all` start a single Node process.
Both consolidated bundles import chat, default, events, integration, schedule, and webhook exactly once.
They never import the disabled AI, trigger, or Kafka worker entrypoints.
Explicit Kafka worker selection is rejected.
Individual non-Kafka bundles remain discoverable; `WORKER_DISABLE` prevents explicitly launching disabled bundles and suppresses a managed worker if its name is added later.

The shared lifecycle registers shutdown handlers once, waits for pending startup, closes all registered consumers even when one fails, then exits with the aggregated status.
Chat remains available until the other consumers drain because active integration jobs may enqueue and await chat replies.
Integration drains its worker before closing chat queue events, preserving in-flight replies waiting for chat completion.
Schedule registration is tracked as startup, and the scheduler's worker and producer queue close during shutdown.
Redis-backed repeat schedules are retained; shutdown does not delete or disable them.
Queue handlers, retries, concurrency defaults and all 18 schedule registrations remain on the runtime-compatible source baseline.
There is no new internal shutdown timeout that kills active jobs early; the parent must allow enough platform drain time for active jobs.

## Verification

Run from the full repository root with Node 24 and pnpm 10.33.2:

```sh
CI=true pnpm install --frozen-lockfile
pnpm lint
pnpm --filter worker check-types
SKIP_ENV_CHECK=true pnpm turbo run build --filter=worker
node scripts/check-worker-deploy.mjs
```

The `Worker remediation` PR workflow builds and typechecks the worker, runs the targeted regression suite, and supplies a local Redis for the opt-in `worker-runtime.test.ts`.
That test writes only to unique test prefixes on `127.0.0.1`, verifies a draining integration job can enqueue and await chat work, and verifies all 18 scheduler keys after registering twice.
Coverage retains the 80% thresholds for the new lifecycle/shutdown modules.
It does not claim whole-application coverage or real third-party channel delivery.
Production health, queue backlog and savings remain release-time acceptance work.

## Parent-only release procedure

Stop at a reviewed PR until the parent approves release.
Do not merge, deploy, restart, change variables, close the issue, or create preview resources during implementation.

Before release, verify the approved immutable head, clean tracked files, passing checks, and independent review.
Merge only into the historical baseline branch when authorized, then use the approved resulting commit.
Never substitute the fork default branch.

In the worker service only, select root directory `/` and custom Railway config path `/apps/worker/railway.toml`.
That config selects `apps/worker/docker/Dockerfile`; clear any service start-command override so Docker's `worker standalone` CMD applies.
These are required parent release selections, not settings this task has changed.
Railway documents that the [config file path is independent of the root directory](https://docs.railway.com/config-as-code).
Do not select this config for builder or realtime.
Keep all environment variables unchanged, including the 1024 MB heap setting and disabled workers.
Confirm the production worker remains a single replica and record its existing termination/drain settings before proceeding.

The failed upload contained only about 5 kB and omitted the Dockerfile.
The preflight rejects a missing/empty repository, a worker-only directory, or a missing worker lockfile entry.
Docker also runs the same guard before pruning.
Validate an archive of the approved commit, then upload the clean full repository root at that same commit:

```sh
cd /Users/thirdz4/Projects/chatbotx-cost-remediation
set -eu
# Set this to the parent-approved release SHA, never a moving branch name.
export WORKER_RELEASE_SHA=<approved-40-character-sha>
test "$(git rev-parse HEAD)" = "$WORKER_RELEASE_SHA"
git diff --exit-code
git diff --cached --exit-code
test -z "$(git ls-files --others --exclude-standard)"
export WORKER_RELEASE_DIR="$PWD/.task-evidence/release-$WORKER_RELEASE_SHA"
test ! -e "$WORKER_RELEASE_DIR"
mkdir -p "$WORKER_RELEASE_DIR"
git archive "$WORKER_RELEASE_SHA" | tar -x -C "$WORKER_RELEASE_DIR"
node "$WORKER_RELEASE_DIR/scripts/check-worker-deploy.mjs" "$WORKER_RELEASE_DIR"
node scripts/check-worker-deploy.mjs
# Execute only after release approval and worker-only config selection.
railway up . --path-as-root --ci \
  --project 8c2a6814-e702-4c3b-b085-b66d299497c7 \
  --environment 562ec1d1-3405-464a-b7ba-9e7850be4ac0 \
  --service 9a54b87e-2070-40ca-a826-68ed7d7745b6 \
  --message "worker consolidation $WORKER_RELEASE_SHA"
```

The validated archive contains the entire tracked repository, not just `apps/worker`.
The upload runs from the full repository root; the ignored archive directory is verification evidence only.
Never upload the parent scratch directory or use `--no-gitignore`.
Record the new deployment ID and image, observe SUCCESS and exactly one consolidated Node worker process, check all six consumers and scheduler activity, then compare stabilized Railway memory and CPU using the same interval as baseline.
Check queue counts/watchdog and HTTP 200 on the canonical app without generating customer transactions.
A successful upload or build is not deployment health proof.

## Rollback

The active deployment reports `canRollback=true` and `canRedeploy=true` at inspection time.
Before release, recheck retention and preserve the ID/image/environment values above.
Use the authenticated CLI's documented GraphQL operation to roll back to that exact deployment, not the latest failed build:

```sh
railway api 'mutation { deploymentRollback(id: "d03fe708-11ac-440d-a87c-78f6cf43dfd1") }'
railway deployment list \
  --project 8c2a6814-e702-4c3b-b085-b66d299497c7 \
  --environment 562ec1d1-3405-464a-b7ba-9e7850be4ac0 \
  --service 9a54b87e-2070-40ca-a826-68ed7d7745b6 --json
```

Reconfirm the restored image digest and six-process roster, and the exact safe environment values.
No variable rollback should be needed because the release must leave variables unchanged.
If Railway no longer retains the deployment, stop before release until the parent has a verified rollback artifact; do not guess an image registry URL from a digest.
After verified release DoD, the parent closes issue #1 and removes temporary worktrees, archive directories and sessions.
