/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when a Pi run settles.
 * Useful for external monitoring scripts to detect when the agent has finished.
 */

import {
  getAgentDir,
  SettingsManager,
  type CustomEntry,
  type ExtensionAPI,
  type SessionEntry,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_MARKER_DIR = "/tmp/pi-notify-marker-files";
const SETTINGS_KEY = "pi-notify-marker";
const PAUSED_BY_DEFAULT_KEY = "pausedByDefault";

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

function escapeMetadataValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function markerMetadata(sessionId: string, sessionLabel: string): string {
  return [
    "Event: AGENT_DONE",
    `Session: ${escapeMetadataValue(sessionLabel)}`,
    `Session ID: ${escapeMetadataValue(sessionId)}`,
    "",
  ].join("\n");
}

async function createMarker(metadata: string): Promise<void> {
  const dir = markerDir();
  const markerPath = path.join(dir, "AGENT_DONE");
  const tempPath = path.join(dir, `.AGENT_DONE.tmp.${randomUUID()}`);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tempPath, metadata, { flag: "wx" });
    await fs.rename(tempPath, markerPath);
  } catch {
    // Silently fail - markers are best-effort
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function isMarkerStateData(data: unknown): data is MarkerStateEntry {
  if (typeof data !== "object" || data === null) return false;
  const override = (data as MarkerStateEntry).override;
  return override === "active" || override === "paused" || override === null;
}

/** Resolve the configured default state for sessions with no explicit override. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function environmentPausedByDefault(): boolean | undefined {
  const raw = process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function readPausedByDefault(
  settings: unknown,
  scope: string,
  warnings: string[],
): boolean | undefined {
  if (!isRecord(settings)) return undefined;
  const namespace = settings[SETTINGS_KEY];
  if (namespace === undefined) return undefined;
  if (!isRecord(namespace)) {
    warnings.push(`${scope}.${SETTINGS_KEY} must be an object`);
    return undefined;
  }

  for (const key of Object.keys(namespace)) {
    if (key !== PAUSED_BY_DEFAULT_KEY) {
      warnings.push(
        `${scope}.${SETTINGS_KEY} has unsupported key ${JSON.stringify(key)}`,
      );
    }
  }

  const value = namespace[PAUSED_BY_DEFAULT_KEY];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    warnings.push(
      `${scope}.${SETTINGS_KEY}.${PAUSED_BY_DEFAULT_KEY} must be a boolean`,
    );
    return undefined;
  }
  return value;
}

function loadConfiguredPausedByDefault(ctx: {
  cwd: string;
  isProjectTrusted: () => boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}): boolean | undefined {
  const warnings: string[] = [];
  try {
    const projectTrusted = ctx.isProjectTrusted();
    const settings = SettingsManager.create(ctx.cwd, getAgentDir(), {
      projectTrusted,
    });
    for (const { scope, error } of settings.drainErrors()) {
      warnings.push(`could not read ${scope} settings: ${error.message}`);
    }

    const globalValue = readPausedByDefault(
      settings.getGlobalSettings(),
      "global settings",
      warnings,
    );
    const projectValue = projectTrusted
      ? readPausedByDefault(
          settings.getProjectSettings(),
          "trusted project settings",
          warnings,
        )
      : undefined;

    for (const warning of warnings) {
      ctx.ui.notify(`notify-marker: ${warning}`, "warning");
    }
    return projectValue ?? globalValue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(
      `notify-marker: could not load settings: ${message}`,
      "warning",
    );
    return undefined;
  }
}

let configuredPausedByDefault: boolean | undefined;

function defaultState(): "active" | "paused" {
  const configured =
    environmentPausedByDefault() ?? configuredPausedByDefault ?? false;
  return configured ? "paused" : "active";
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
    configuredPausedByDefault = loadConfiguredPausedByDefault(ctx);

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
    const sessionId = ctx.sessionManager.getSessionId();
    const sessionLabel = pi.getSessionName() ?? sessionId;
    await createMarker(markerMetadata(sessionId, sessionLabel));
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
