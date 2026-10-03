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
import { describe, expect, it } from "vite-plus/test";

import { createWorkspaceAutomationBodySchema } from "./workspace-automation.schema";

describe("createWorkspaceAutomationBodySchema", () => {
  it("accepts a content sync payload without trigger or tool config", () => {
    const parsed = createWorkspaceAutomationBodySchema.safeParse({
      kind: "content_sync",
      name: "Sync acme/web",
      projectId: "project-1",
      syncConfig: {
        provider: "github",
        connectionId: "22222222-2222-4222-8222-222222222222",
        resourceKey: "acme/web",
        providerFolder: "locales",
        projectFolder: "github/acme/web",
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe("content_sync");
    }
  });

  it("accepts an agent automation with a skill and no instructions", () => {
    const parsed = createWorkspaceAutomationBodySchema.safeParse({
      name: "Research brief",
      triggerConfig: { mode: "manual" },
      repositoryTarget: { kind: "none" },
      toolConfig: { webSearch: { enabled: true } },
      skillIds: ["research-web"],
    });

    expect(parsed.success).toBe(true);
  });

  it("still requires instructions for agent automations without a skill", () => {
    const parsed = createWorkspaceAutomationBodySchema.safeParse({
      name: "Review pull requests",
      triggerConfig: { mode: "manual" },
      repositoryTarget: { kind: "none" },
      toolConfig: {},
    });

    expect(parsed.success).toBe(false);
  });
});
