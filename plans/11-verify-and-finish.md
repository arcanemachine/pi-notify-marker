# 11 — Verify and finish

## Objective

Verify the integrated change against tests, static checks, and the running system before versioning and committing it.

## Dependencies

Complete items 01–10 first. Do not use this item to conceal unfinished implementation or failing tests.

## Files potentially touched

- `package.json` — release version only after verification
- Files changed by required formatting, limited to intended project files

Do not hand-edit `dist/index.js`. The package manifest loads `src/index.ts`, and generated output should only be updated if repository tracking/release policy explicitly requires it.

## Static verification

Run focused checks from the package root:

```bash
npm test
bash -n watch-and-notify.sh
npx tsc --noEmit
npx prettier --write src/index.ts package.json
```

Also format newly added test/config/Markdown files with the project’s available Prettier version, without reformatting unrelated files.

After formatting, rerun:

```bash
npm test
npx tsc --noEmit
```

Review full command output; do not truncate failures.

## Filesystem and watcher smoke verification

Use a temporary marker directory, never the default shared directory.

Verify:

1. A synthetic or test-driven settled event creates one `AGENT_DONE.*` marker.
2. Its contents are the expected session label.
3. Multiple writes create multiple files.
4. The watcher displays the logical event without suffix.
5. The watcher deletes only the consumed marker.
6. A second watcher is rejected when `flock` is available.

Tests may satisfy most of this. Do not invoke real `notify-send` without user approval.

## Pi runtime smoke verification

Offer this separately before calling the work complete. Use a supported current Pi runtime and a temporary marker directory.

Suggested checks:

- load the local extension;
- invoke status, pause, unpause, and status again;
- confirm command notifications and persisted state across `/reload`;
- confirm `/new` and `/fork` use the configured default;
- run one real agent prompt only with explicit approval, then confirm the marker appears after `agent_settled`.

A real model request may consume credentials or paid tokens; never run it implicitly.

## Diff review

Before versioning or committing:

- inspect `git status` and the full diff;
- ensure only intended files changed;
- ensure no `package-lock.json` was introduced without approval;
- ensure no credentials, host paths, temporary files, or generated test artifacts are present;
- ensure ROADBLOCK and `user_bash` references are removed from functional documentation/source;
- ensure no old-event fallback remains;
- ensure plans and implementation agree.

## Versioning

This is a feature release from `0.2.0`; the expected next version is `0.3.0` unless the user selects a different release number.

Bump the version only after all accepted verification passes. Do not tie the Pi package’s version to sibling-project versions.

## Commit

The project’s `AGENTS.md` requires a commit when the task is completed.

- Wait for explicit user acceptance of the implementation and verification result.
- Stage only files changed for this task, using explicit paths.
- Use the repository’s existing concise imperative commit style.
- Do not include agent names, plan references, or ephemeral Pi commit hashes in the commit message.

Possible style:

```text
Add session-aware marker notifications
```

Use a different message if the final scope changes.

## Final acceptance criteria

- Focused tests pass.
- TypeScript check passes.
- Shell syntax check passes.
- Required formatting is applied.
- Runtime behavior has either been exercised or explicitly left pending with user acknowledgement.
- Documentation matches behavior.
- Package version is correct for the release.
- The completed, accepted task is committed according to repository instructions.

## Future-agent cautions

- “Looks correct” is not runtime verification.
- Do not claim desktop notifications were verified if tests used a fake `notify-send`.
- Do not commit unverified implementation changes.
