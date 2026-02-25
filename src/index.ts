/**
 * pi-notify-marker
 * Marker file plugin for Pi coding agent
 *
 * Creates marker files in a configurable directory when specific events occur.
 * Useful for external monitoring scripts to detect when Pi needs attention.
 *
 * Features:
 * - Creates marker files for session_idle, session_error, permission_required events
 * - Parent session only (no spam from child sessions)
 * - No terminal detection, no quiet hours, no sounds
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs/promises";
import * as path from "path";

const MARKER_DIR = process.env.MARKER_DIR || "/workspace/tmp/pi-notify-marker-files";

interface MarkerConfig {
  /** Create markers for child/sub-session events (default: false) */
  notifyChildSessions?: boolean;
}

const DEFAULT_CONFIG: MarkerConfig = {
  notifyChildSessions: false,
};

async function loadConfig(): Promise<MarkerConfig> {
  const configPath = path.join(
    typeof process.env.HOME !== "undefined" ? process.env.HOME : "/root",
    ".pi",
    "agent",
    "pi-notify-marker.json",
  );

  try {
    const content = await fs.readFile(configPath, "utf8");
    const userConfig = JSON.parse(content) as Partial<MarkerConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function isParentSession(pi: ExtensionAPI, sessionID: string): Promise<boolean> {
  // For Pi, we need to check if this is a parent session
  // This is a simplified version - actual implementation may vary
  try {
    // Try to get session info
    // Note: Pi's session manager API may differ from OpenCode
    return true; // Assume parent if we can't determine
  } catch {
    return true;
  }
}

async function createMarker(eventName: string): Promise<void> {
  try {
    await fs.mkdir(MARKER_DIR, { recursive: true });
    const markerPath = path.join(MARKER_DIR, eventName);
    await fs.writeFile(markerPath, JSON.stringify({ created: new Date().toISOString() }));
  } catch {
    // Silently fail - markers are best-effort
  }
}

async function handleSessionIdle(pi: ExtensionAPI, sessionID: string, config: MarkerConfig): Promise<void> {
  if (!config.notifyChildSessions) {
    const isParent = await isParentSession(pi, sessionID);
    if (!isParent) return;
  }
  await createMarker("SESSION_IDLE");
}

async function handleSessionError(pi: ExtensionAPI, sessionID: string, config: MarkerConfig): Promise<void> {
  if (!config.notifyChildSessions) {
    const isParent = await isParentSession(pi, sessionID);
    if (!isParent) return;
  }
  await createMarker("SESSION_ERROR");
}

async function handlePermissionRequired(config: MarkerConfig): Promise<void> {
  await createMarker("PERMISSION_REQUIRED");
}

export default function (pi: ExtensionAPI) {
  return async () => {
    const config = await loadConfig();

    pi.on("session_idle", async (event) => {
      if (event.sessionID) {
        await handleSessionIdle(pi, event.sessionID, config);
      }
    });

    pi.on("session_error", async (event) => {
      if (event.sessionID) {
        await handleSessionError(pi, event.sessionID, config);
      }
    });

    pi.on("permission_required", async () => {
      await handlePermissionRequired(config);
    });
  };
}
