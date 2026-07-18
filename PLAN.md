# PLAN — pi-notify-marker improvements

Tracks the eleven-item improvement plan. Status is updated by the orchestrator before and after each task.

## Overview

Port selected improvements from the Claude sibling (`projects/pi/claude-code/_git/claude-code-notify-marker`) to this Pi package, adapting to the current Pi extension API. Direction: do **not** preserve backward compatibility; keep information evergreen.

Key product decisions (see `plans/` for rationale):
- Replace `agent_end` with `agent_settled` for the `AGENT_DONE` marker.
- Remove `ROADBLOCK` (`user_bash` is not a roadblock signal); no heuristic replacement.
- Unique marker names: `AGENT_DONE.<suffix>` (process-independent randomness).
- Plain-text session attribution: session name, falling back to session ID.
- Pi-native pause state via custom session entries (not shared files).
- Commands: `/notify-marker:pause`, `/notify-marker:unpause`, `/notify-marker:status`.
- Paused-by-default via `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT`.
- Harden `watch-and-notify.sh` (`flock`, `close_write`, suffix stripping, dotfile ignoring, polling fallback).
- Tests: `node:test` + `tsx`; fake `notify-send`/`inotifywait`; no model/tokens/real notifications.
- Add current Pi as a dev dependency (optional peer remains `"*"`).

## Compatibility

- Targets current Pi API (`agent_settled` requires a current release; verified minimum during planning was `0.80.10`, but use the latest available).
- Installed dev peer at session start was `0.74.0` (lacks `agent_settled`); item 01 upgrades it.
- No old-API shims or `agent_end` fallback.

## Execution order

1.  `01-update-development-tooling` — dev deps, test script, `tsconfig.test.json`
2.  `02-correct-event-behavior` — `agent_settled`; remove `ROADBLOCK`
3.  `03-add-marker-isolation` — unique `AGENT_DONE.<suffix>`
4.  `04-add-session-attribution` — plain-text session label
5.  `05-add-pause-state` — custom-entry persistence + restore/reset
6.  `06-add-commands` — pause/unpause/status
7.  `07-add-paused-by-default` — env parsing + precedence
8.  `09-add-tests` — test harness + extension/watcher tests
9.  `08-harden-watcher` — watcher hardening (depends on marker format from 03/04)
10. `10-update-documentation` — README
11. `11-verify-and-finish` — static + runtime smoke, version bump, final commit

## Status

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 00 | Plans + PLAN.md | pending | — |
| 01 | update-development-tooling | not started | — |
| 02 | correct-event-behavior | not started | — |
| 03 | add-marker-isolation | not started | — |
| 04 | add-session-attribution | not started | — |
| 05 | add-pause-state | not started | — |
| 06 | add-commands | not started | — |
| 07 | add-paused-by-default | not started | — |
| 08 | harden-watcher | not started | — |
| 09 | add-tests | not started | — |
| 10 | update-documentation | not started | — |
| 11 | verify-and-finish | not started | — |

## Workflow rules

- One item per worker packet; one fresh worker per task; never reuse a completed worker.
- Worker does **not** commit and does **not** run git/prettier. Orchestrator reviews, applies small mechanical fixes in-context, issues significant rework to the worker, then runs pre-commit checks and commits.
- Pre-commit (orchestrator): `npx tsc --noEmit`, `npx prettier --write src/index.ts package.json` (and other added files as appropriate).
- Per item: mark in-progress + commit PLAN.md, dispatch, review (+fix/rework), commit implementation, mark done + commit PLAN.md, report to user before next dispatch.
- Report to the user and await a fresh worker before dispatching the next item.
- Version bump is deferred to the final release (item 11); expected `0.2.0 → 0.3.0`.

## Notes

- Progress log appended below per item as work is completed.

### Progress log

(Updated as items complete.)