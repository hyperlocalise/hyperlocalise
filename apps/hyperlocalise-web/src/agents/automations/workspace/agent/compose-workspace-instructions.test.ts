/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { composeWorkspaceAutomationInstructions } from "./compose-workspace-instructions";

describe("composeWorkspaceAutomationInstructions", () => {
  it("includes selected knowledge when memories are enabled", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["notify_slack"] },
      userOverride: "Notify the team.",
      knowledgeEnabled: true,
      knowledgeMemory: "Use sentence case for feature names.",
    });

    expect(instructions).toContain("Workspace knowledge memories are enabled");
    expect(instructions).toContain("## Workspace knowledge");
    expect(instructions).toContain("Use sentence case for feature names.");
  });

  it("omits knowledge context copy when memories are enabled but empty", () => {
    const instructions = composeWorkspaceAutomationInstructions({
      triggerMode: "manual",
      plan: { tools: ["notify_slack"] },
      userOverride: "Notify the team.",
      knowledgeEnabled: true,
      knowledgeMemory: null,
    });

    expect(instructions).not.toContain("applied as context below");
    expect(instructions).not.toContain("## Workspace knowledge");
  });
});
