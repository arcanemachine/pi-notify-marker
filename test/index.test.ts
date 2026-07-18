import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CustomEntry,
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import extension from "../src/index.ts";

// Pinned in tests to guard the persisted-state contract. If the extension changes
// this custom type, restore tests below fail until updated.
const STATE_TYPE = "pi-notify-marker:state";

type AnyHandler = (event: unknown, ctx: unknown) => unknown;
type AnyCommandHandler = (args: string, ctx: unknown) => Promise<void> | void;

interface NotifiedCall {
  message: string;
  type: "info" | "warning" | "error";
}

interface AppendedEntry {
  customType: string;
  data: unknown;
}

interface MockCommand {
  description?: string;
  handler: AnyCommandHandler;
}

function makeStateEntry(
  override: "active" | "paused" | null,
  index = 0,
): CustomEntry {
  return {
    type: "custom",
    customType: STATE_TYPE,
    data: { override },
    id: `state-${index}-${randomUUID()}`,
    parentId: index === 0 ? null : `state-${index - 1}`,
    timestamp: new Date(Date.now() + index).toISOString(),
  } as CustomEntry;
}

class Harness {
  sessionName: string | undefined = undefined;
  sessionId = randomUUID();
  entries: SessionEntry[] = [];
  appendCalls: AppendedEntry[] = [];
  notifies: NotifiedCall[] = [];
  handlers: Record<string, AnyHandler | undefined> = {};
  commands: Record<string, MockCommand | undefined> = {};

  readonly ctx = {
    sessionManager: {
      getSessionId: () => this.sessionId,
      getEntries: (): SessionEntry[] => [...this.entries],
    },
    ui: {
      notify: (
        message: string,
        type: "info" | "warning" | "error" = "info",
      ) => {
        this.notifies.push({ message, type });
      },
    },
  };

  readonly pi: ExtensionAPI = {
    on: (event: string, handler: AnyHandler) => {
      this.handlers[event] = handler;
    },
    registerCommand: (
      name: string,
      options: { description?: string; handler: AnyCommandHandler },
    ) => {
      this.commands[name] = {
        description: options.description,
        handler: options.handler,
      };
    },
    appendEntry: (customType: string, data?: unknown) => {
      const entry: AppendedEntry = { customType, data };
      this.appendCalls.push(entry);
      this.entries.push(makeStateEntryUnknown(data, this.entries.length));
    },
    getSessionName: () => this.sessionName,
  } as unknown as ExtensionAPI;

  constructor() {
    extension(this.pi);
  }

  fireSettled(): Promise<void> {
    const h = this.handlers["agent_settled"];
    assert.ok(h, "agent_settled not registered");
    return Promise.resolve(
      h({ type: "agent_settled" }, this.ctx) as unknown,
    ) as unknown as Promise<void>;
  }

  fireSessionStart(
    reason: "startup" | "reload" | "new" | "resume" | "fork",
  ): Promise<void> {
    const h = this.handlers["session_start"];
    assert.ok(h, "session_start not registered");
    return Promise.resolve(
      h({ type: "session_start", reason }, this.ctx) as unknown,
    ) as unknown as Promise<void>;
  }

  runCommand(name: string, args = ""): Promise<void> {
    const cmd = this.commands[name];
    assert.ok(cmd, `command ${name} not registered`);
    return Promise.resolve(
      cmd.handler(args, this.ctx) as unknown,
    ) as unknown as Promise<void>;
  }
}

function makeStateEntryUnknown(data: unknown, index: number): SessionEntry {
  return {
    type: "custom",
    customType: STATE_TYPE,
    data,
    id: `state-appended-${index}-${randomUUID()}`,
    parentId: index === 0 ? null : `state-appended-${index - 1}`,
    timestamp: new Date().toISOString(),
  } as unknown as SessionEntry;
}

let savedEnv: string | undefined;
let savedPausedByDefault: string | undefined;
let tempDir: string;

beforeEach(async () => {
  savedEnv = process.env.PI_NOTIFY_MARKER_DIR;
  savedPausedByDefault = process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
  delete process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
  tempDir = await mkdtemp(join(tmpdir(), "pnm-test-"));
  process.env.PI_NOTIFY_MARKER_DIR = tempDir;
});

afterEach(async () => {
  if (savedEnv === undefined) {
    delete process.env.PI_NOTIFY_MARKER_DIR;
  } else {
    process.env.PI_NOTIFY_MARKER_DIR = savedEnv;
  }
  if (savedPausedByDefault === undefined) {
    delete process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
  } else {
    process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT = savedPausedByDefault;
  }
  await rm(tempDir, { recursive: true, force: true });
});

async function markerFiles(): Promise<string[]> {
  const all = await readdir(tempDir);
  return all.filter((f) => f.startsWith("AGENT_DONE."));
}

describe("registration and lifecycle", () => {
  it("registers agent_settled", () => {
    const h = new Harness();
    assert.equal(h.handlers["agent_settled"] !== undefined, true);
    assert.equal(h.handlers["agent_end"], undefined);
    assert.equal(h.handlers["user_bash"], undefined);
  });

  it("registers the three exact commands", () => {
    const h = new Harness();
    assert.deepEqual(Object.keys(h.commands).sort(), [
      "notify-marker:pause",
      "notify-marker:status",
      "notify-marker:unpause",
    ]);
  });
});

describe("marker behavior", () => {
  it("creates the directory and one uniquely-named marker per settled event", async () => {
    const h = new Harness();
    await h.fireSettled();
    await h.fireSettled();
    const files = await markerFiles();
    assert.equal(files.length, 2);
    assert.equal(new Set(files).size, 2);
    for (const f of files) {
      assert.match(f, /^AGENT_DONE\.[0-9a-f-]{36}$/);
    }
  });

  it("concurrent settled events do not collide", async () => {
    const h = new Harness();
    const n = 20;
    await Promise.all(Array.from({ length: n }, () => h.fireSettled()));
    const files = await markerFiles();
    assert.equal(files.length, n);
    assert.equal(new Set(files).size, n);
  });

  it("preserves pre-existing files (exclusive creation)", async () => {
    await writeFile(join(tempDir, "pre-existing.txt"), "keep");
    const h = new Harness();
    await h.fireSettled();
    const all = await readdir(tempDir);
    assert.ok(all.includes("pre-existing.txt"));
    const content = await readFile(join(tempDir, "pre-existing.txt"), "utf8");
    assert.equal(content, "keep");
    assert.equal((await markerFiles()).length, 1);
  });

  it("silently tolerates filesystem failure", async () => {
    // Make the configured marker dir a path whose parent is a regular file.
    const blocker = join(tempDir, "blocker");
    await writeFile(blocker, "x");
    process.env.PI_NOTIFY_MARKER_DIR = join(blocker, "sub");
    const h = new Harness();
    await h.fireSettled(); // must not reject
    assert.equal((await markerFiles()).length, 0);
  });
});

describe("session attribution", () => {
  it("writes the session name when available", async () => {
    const h = new Harness();
    h.sessionName = "my special session";
    await h.fireSettled();
    const files = await markerFiles();
    assert.equal(files.length, 1);
    const content = await readFile(join(tempDir, files[0]), "utf8");
    assert.equal(content, "my special session");
  });

  it("falls back to the session id when no name", async () => {
    const h = new Harness();
    await h.fireSettled();
    const files = await markerFiles();
    const content = await readFile(join(tempDir, files[0]), "utf8");
    assert.equal(content, h.sessionId);
  });

  it("uses the latest name after rename between events", async () => {
    const h = new Harness();
    h.sessionName = "old name";
    await h.fireSettled();
    h.sessionName = "new name";
    await h.fireSettled();
    const files = await markerFiles();
    assert.equal(files.length, 2);
    const contents = await Promise.all(
      files.sort().map((f) => readFile(join(tempDir, f), "utf8")),
    );
    assert.ok(contents.includes("old name"));
    assert.ok(contents.includes("new name"));
  });

  it("names with spaces remain intact", async () => {
    const h = new Harness();
    h.sessionName = "  spaced out  ";
    await h.fireSettled();
    const files = await markerFiles();
    const content = await readFile(join(tempDir, files[0]), "utf8");
    assert.equal(content, "  spaced out  ");
  });
});

describe("state restoration", () => {
  it("restores latest valid state on reload", async () => {
    const h = new Harness();
    h.entries = [makeStateEntry("active", 0), makeStateEntry("paused", 1)];
    await h.fireSessionStart("reload");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 0); // paused suppresses
  });

  it("restores explicit active state on resume", async () => {
    const h = new Harness();
    h.entries = [makeStateEntry("active", 0)];
    await h.fireSessionStart("resume");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1);
  });

  it("startup restores latest valid state", async () => {
    const h = new Harness();
    h.entries = [makeStateEntry("paused", 0)];
    await h.fireSessionStart("startup");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 0);
  });

  it("ignores malformed state and falls back to default", async () => {
    const h = new Harness();
    h.entries = [
      {
        type: "custom",
        customType: STATE_TYPE,
        data: { override: "bogus" },
        id: "x",
        parentId: null,
        timestamp: new Date().toISOString(),
      } as unknown as SessionEntry,
    ];
    await h.fireSessionStart("reload");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1); // default active
  });

  it("ignores non-object state data", async () => {
    const h = new Harness();
    h.entries = [
      {
        type: "custom",
        customType: STATE_TYPE,
        data: "not-object",
        id: "x",
        parentId: null,
        timestamp: new Date().toISOString(),
      } as unknown as SessionEntry,
    ];
    await h.fireSessionStart("reload");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1);
  });

  it("resets to default on new sessions", async () => {
    const h = new Harness();
    h.entries = [makeStateEntry("paused", 0)];
    await h.fireSessionStart("new");
    assert.equal(h.appendCalls.length, 0);
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1); // default active
  });

  it("forks reset and persist a reset entry when state was inherited", async () => {
    const h = new Harness();
    h.entries = [makeStateEntry("paused", 0)];
    await h.fireSessionStart("fork");
    assert.equal(h.appendCalls.length, 1);
    assert.equal(h.appendCalls[0].customType, STATE_TYPE);
    assert.deepEqual(h.appendCalls[0].data, { override: null });
    // Now a subsequent reload should see the persisted reset entry as latest.
    const h2 = new Harness();
    h2.entries = [...h.entries, makeStateEntry(null, 1)];
    await h2.fireSessionStart("reload");
    await h2.fireSettled();
    assert.equal((await markerFiles()).length, 1); // default active
  });

  it("fork without inherited state does not append a reset entry", async () => {
    const h = new Harness();
    h.entries = [];
    await h.fireSessionStart("fork");
    assert.equal(h.appendCalls.length, 0);
  });
});

describe("commands", () => {
  it("pause sets state, appends, and notifies", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:pause");
    assert.equal(h.appendCalls.length, 1);
    assert.equal(h.appendCalls[0].customType, STATE_TYPE);
    assert.deepEqual(h.appendCalls[0].data, { override: "paused" });
    assert.ok(h.notifies.some((n) => n.message === "notify-marker: paused"));
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 0);
  });

  it("unpause sets state, appends, and notifies", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:pause");
    await h.runCommand("notify-marker:unpause");
    assert.equal(h.appendCalls.length, 2);
    assert.deepEqual(h.appendCalls[1].data, { override: "active" });
    assert.ok(h.notifies.some((n) => n.message === "notify-marker: unpaused"));
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1);
  });

  it("status does not append entries", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:status");
    assert.equal(h.appendCalls.length, 0);
  });

  it("status reports default state when no override", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:status");
    assert.ok(h.notifies.some((n) => n.message === "active (default)"));
  });

  it("status reports explicit state after pause", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:pause");
    h.notifies.length = 0;
    await h.runCommand("notify-marker:status");
    assert.ok(h.notifies.some((n) => n.message === "paused"));
  });

  it("pausing before a settled event suppresses the marker", async () => {
    const h = new Harness();
    await h.runCommand("notify-marker:pause");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 0);
    await h.runCommand("notify-marker:unpause");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1);
  });
});

describe("paused by default", () => {
  const truthy = ["1", "true", "yes", "on", "TRUE", " Yes ", "On"];
  for (const v of truthy) {
    it(`treats ${JSON.stringify(v)} as truthy → paused default`, async () => {
      process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT = v;
      const h = new Harness();
      await h.fireSessionStart("new");
      h.notifies.length = 0;
      await h.runCommand("notify-marker:status");
      assert.ok(h.notifies.some((n) => n.message === "paused (default)"));
      await h.fireSettled();
      assert.equal((await markerFiles()).length, 0);
    });
  }

  const falsey = ["", "0", "false", "no", "off", "maybe", undefined];
  for (const v of falsey) {
    it(`treats ${JSON.stringify(v)} as falsey → active default`, async () => {
      if (v === undefined) {
        delete process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
      } else {
        process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT = v;
      }
      const h = new Harness();
      await h.fireSessionStart("new");
      h.notifies.length = 0;
      await h.runCommand("notify-marker:status");
      assert.ok(h.notifies.some((n) => n.message === "active (default)"));
      await h.fireSettled();
      assert.equal((await markerFiles()).length, 1);
    });
  }

  it("explicit unpause overrides paused default", async () => {
    process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT = "1";
    const h = new Harness();
    await h.fireSessionStart("new");
    await h.runCommand("notify-marker:unpause");
    h.notifies.length = 0;
    await h.runCommand("notify-marker:status");
    assert.ok(h.notifies.some((n) => n.message === "active"));
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 1);
  });

  it("explicit pause overrides active default", async () => {
    delete process.env.PI_NOTIFY_MARKER_PAUSED_BY_DEFAULT;
    const h = new Harness();
    await h.fireSessionStart("new");
    await h.runCommand("notify-marker:pause");
    await h.fireSettled();
    assert.equal((await markerFiles()).length, 0);
  });
});
