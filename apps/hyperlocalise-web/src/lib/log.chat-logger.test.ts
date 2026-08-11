/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vite-plus/test";
import type { DrainContext, WideEvent } from "evlog";

import { configureLoggerForTest, createChatLogger } from "./log";

const drainedEvents: WideEvent[] = [];

beforeEach(() => {
  drainedEvents.length = 0;
  configureLoggerForTest({
    silent: true,
    drain: (context: DrainContext) => {
      drainedEvents.push(context.event);
    },
  });
});

describe("createChatLogger", () => {
  it("does not import chat (Workflow DevKit sandbox safety)", () => {
    // Reintroducing `import type { Logger } from "chat"` pulls async_hooks into
    // workflow sandbox bundles and crashes source-file-ingest / automations.
    const source = readFileSync(path.join(import.meta.dirname, "log.ts"), "utf8");
    // Side-effect and named/type imports of chat (or chat/*) all pull the package
    // into Workflow DevKit sandbox bundles.
    expect(source).not.toMatch(
      /(?:^|[;\n])\s*import\s(?!\()(?:type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']chat(?:\/[^"'`]*)?["']/,
    );
  });

  it("nests child prefixes and stringifies messages with args", () => {
    const logger = createChatLogger("chat").child("web");
    logger.info("hello", { requestId: "req_1" });
    // Chat SDK may pass non-strings; createChatLogger always String()s.
    logger.warn(42 as unknown as string, "extra");

    expect(drainedEvents).toHaveLength(2);
    expect(drainedEvents[0]).toMatchObject({
      level: "info",
      message: "hello",
      prefix: "chat:web",
      args: [{ requestId: "req_1" }],
    });
    expect(drainedEvents[1]).toMatchObject({
      level: "warn",
      message: "42",
      prefix: "chat:web",
      args: ["extra"],
    });
  });
});
