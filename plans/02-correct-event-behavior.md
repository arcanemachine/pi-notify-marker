# 02 — Correct event behavior

## Objective

Emit completion markers only when Pi has fully settled, and remove the invalid ROADBLOCK behavior.

## Problem

The current extension listens to:

- `agent_end` for `AGENT_DONE`;
- `user_bash` for `ROADBLOCK`.

Both mappings are unsuitable:

- `agent_end` can precede automatic retry, compaction recovery, or queued continuation.
- `user_bash` means the user entered a `!` or `!!` shell command; it does not indicate that the agent needs input.

Current Pi has no reliable generic “agent needs attention” event. Do not infer it from assistant text or tool calls.

## Confirmed Pi behavior

Relevant current Pi symbols:

- `AgentSettledEvent` in `packages/coding-agent/src/core/extensions/types.ts`.
- `AgentSession._emitAgentSettled()` and `AgentSession._runAgentPrompt()` in `packages/coding-agent/src/core/agent-session.ts`.
- `UserBashEvent` in `packages/coding-agent/src/core/extensions/types.ts`.

`agent_settled` is emitted after post-run retry, compaction, and queued-message processing completes.

## Files to touch

- `src/index.ts`
- `test/index.test.ts` — created under item 09

Documentation changes belong to item 10.

## Implementation steps

1. Remove the `user_bash` handler completely.
2. Remove the `ROADBLOCK` marker creation path and any associated constants.
3. Replace the `agent_end` subscription with `agent_settled`.
4. Keep marker emission asynchronous and best-effort.
5. Ensure the settled handler consults pause state before writing; items 05–07 define that state.
6. Do not register both `agent_end` and `agent_settled`.
7. Do not add timers, polling, response-text parsing, or tool-call heuristics.

Expected registration shape:

```ts
pi.on("agent_settled", async (_event, ctx) => {
  // Check active state, resolve label, then create AGENT_DONE marker.
});
```

## Tests

Use a minimal mock `ExtensionAPI` that records registered handlers.

Test that:

- `agent_settled` is registered exactly once;
- `agent_end` is not registered;
- `user_bash` is not registered;
- invoking `agent_settled` while active creates one `AGENT_DONE.*` marker;
- invoking it while paused creates no marker;
- no `ROADBLOCK*` marker can be produced.

Do not test Pi internals; test the extension’s registrations and observable filesystem behavior.

## Acceptance criteria

- Completion cannot fire from `agent_end`.
- User shell commands cannot create notification markers.
- No ROADBLOCK feature remains in source or tests.
- The implementation requires the current Pi API rather than preserving old behavior.

## Future-agent cautions

- “Agent settled” includes successful completion and terminal failure after recovery is exhausted. It is a lifecycle state, not a success-only signal. Keep the marker description accurate.
- Session switching or aborting should not be compensated with a synthetic completion marker.
