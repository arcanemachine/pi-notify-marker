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

const PI_NOTIFY_MARKER_DIR =
  process.env.PI_NOTIFY_MARKER_DIR || "/tmp/pi-notify-marker-files";

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
    await fs.mkdir(PI_NOTIFY_MARKER_DIR, { recursive: true });
    const markerPath = path.join(
      PI_NOTIFY_MARKER_DIR,
      `${eventPrefix}.${randomUUID()}`,
    );
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
    const effective = override ?? "active";
    if (effective === "paused") return;
    const label = pi.getSessionName() ?? ctx.sessionManager.getSessionId();
    await createMarker("AGENT_DONE", label);
  });
}
