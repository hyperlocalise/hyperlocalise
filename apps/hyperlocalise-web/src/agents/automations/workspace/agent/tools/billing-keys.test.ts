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
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

describe("automation tool billing keys", () => {
  it("carry the run in every tool step's key", async () => {
    // go-svc's AI usage reads the run id from the second part of these keys; a tool that puts
    // anything else there would lose its AI from the automation, on AI usage and on Costs.
    const tools = join(process.cwd(), "src/agents/automations/workspace/agent/tools");
    const keys = (await readdir(tools))
      .filter((name) => name.startsWith("use_") && !name.includes(".test."))
      .map(async (name) => {
        const text = await readFile(join(tools, name), "utf8");
        return [...text.matchAll(/operationKey: `([^`]*)`/g)].map((match) => match[1]!);
      });
    const found = (await Promise.all(keys)).flat();
    expect(found.length).toBeGreaterThanOrEqual(7);
    for (const key of found) expect(key).toMatch(/^workspace-[a-z-]+:\$\{session\.run\.id\}:/);
  });
});
