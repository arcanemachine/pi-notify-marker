/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when a Pi run settles.
 * Useful for external monitoring scripts to detect when the agent has finished.
 */

import type {
  CustomEntry,
  ExtensionAPI,
  SessionEntry,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_MARKER_DIR = "/tmp/pi-notify-marker-files";

/** Resolve the marker directory at call time so env changes apply without reload. */
function markerDir(): string {
  return process.env.PI_NOTIFY_MARKER_DIR || DEFAULT_MARKER_DIR;
}

/** Custom session entry type persisting explicit pause state. */
const STATE_CUSTOM_TYPE = "pi-notify-marker:state";

interface MarkerStateEntry {
  /**
   * Explicit pause override for this session. `null` means no override; use the
   * configured default.
   */
  override: "active" | "paused" | null;
}

type Override = "active" | "paused" | null;

async function createMarker(eventPrefix: string, label: string): Promise<void> {
  try {
    await fs.mkdir(markerDir(), { recursive: true });
    const dir = markerDir();
    const markerPath = path.join(dir, `${eventPrefix}.${randomUUID()}`);
    await fs.writeFile(markerPath, label, { flag: "wx" });
  } catch {
    // Silently fail - markers are best-effort
  }
}

function isMarkerStateData(data: unknown): data is MarkerStateEntry {
  if (typeof data !== "object" || data === null) return false;
  const override = (data as MarkerStateEntry).override;
  return override === "active" || override === "paused" || override === null;
}

/**
 * Configured default state for sessions with no explicit override.
 * `PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT` truthy (1|true|yes|on) → paused.
 */
function defaultState(): "active" | "paused" {
  const raw =
    process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
    ? "paused"
    : "active";
}

function statusText(override: Override): string {
  if (override === "active" || override === "paused") return override;
  return `${defaultState()} (default)`;
}

/**
 * Restore the latest valid notify-marker override from the session entry list,
 * scanning newest-first. Returns `null` when no valid entry exists.
 */
function restoreOverride(entries: SessionEntry[]): Override {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom") continue;
    const custom = entry as CustomEntry;
    if (custom.customType !== STATE_CUSTOM_TYPE) continue;
    if (!isMarkerStateData(custom.data)) continue;
    return custom.data.override;
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  // Explicit per-session pause state. `null` means use the configured default.
  let override: Override = null;

  // On session start, restore explicit state for startup/reload/resume, and reset
  // to the default for new/fork. For forks, persist a reset entry if the forked
  // session inherited an explicit override, so a later reload cannot resurrect it.
  pi.on("session_start", async (event: SessionStartEvent, ctx) => {
    if (
      event.reason === "startup" ||
      event.reason === "reload" ||
      event.reason === "resume"
    ) {
      override = restoreOverride(ctx.sessionManager.getEntries());
      return;
    }

    // "new" or "fork": reset to the configured default.
    override = null;

    if (event.reason === "fork") {
      const inherited = restoreOverride(ctx.sessionManager.getEntries());
      if (inherited !== null) {
        pi.appendEntry<MarkerStateEntry>(STATE_CUSTOM_TYPE, { override: null });
      }
    }
  });

  // Create marker when the agent run settles, unless this session is paused.
  pi.on("agent_settled", async (_event, ctx) => {
    const effective = override ?? defaultState();
    if (effective === "paused") return;
    const label = pi.getSessionName() ?? ctx.sessionManager.getSessionId();
    await createMarker("AGENT_DONE", label);
  });

  pi.registerCommand("notify-marker:pause", {
    description: "Pause pi-notify-marker completion notifications.",
    handler: async (_args, ctx) => {
      override = "paused";
      pi.appendEntry<MarkerStateEntry>(STATE_CUSTOM_TYPE, {
        override: "paused",
      });
      ctx.ui.notify("notify-marker: paused", "info");
    },
  });

  pi.registerCommand("notify-marker:unpause", {
    description: "Unpause pi-notify-marker completion notifications.",
    handler: async (_args, ctx) => {
      override = "active";
      pi.appendEntry<MarkerStateEntry>(STATE_CUSTOM_TYPE, {
        override: "active",
      });
      ctx.ui.notify("notify-marker: unpaused", "info");
    },
  });

  pi.registerCommand("notify-marker:status", {
    description: "Show pi-notify-marker pause state.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(statusText(override), "info");
    },
  });
}
