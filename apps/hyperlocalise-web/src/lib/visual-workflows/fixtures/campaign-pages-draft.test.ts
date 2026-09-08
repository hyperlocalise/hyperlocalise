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

import { runPlaygroundWorkflow } from "../preview/playground-run";
import { visualWorkflowCampaignPagesDraft } from "./campaign-pages-draft";

describe("visualWorkflowCampaignPagesDraft", () => {
  it("seeds a brief-to-Contentful campaign graph", () => {
    expect(visualWorkflowCampaignPagesDraft.name).toBe("Publish campaign pages");
    expect(visualWorkflowCampaignPagesDraft.nodes.map((node) => node.type)).toEqual([
      "trigger.source_upload",
      "ai.agent",
      "ai.agent",
      "logic.if",
      "action.http",
      "action.notify_slack",
    ]);
    expect(visualWorkflowCampaignPagesDraft.nodes[1]?.data.previewSubtitle).toBe(
      "Draft the landing page",
    );
    expect(
      visualWorkflowCampaignPagesDraft.edges.find((edge) => edge.target === "cms")?.sourceHandle,
    ).toBe("true");
    expect(
      visualWorkflowCampaignPagesDraft.edges.find((edge) => edge.target === "slack")?.sourceHandle,
    ).toBe("false");
  });

  it("completes a simulated playground run through Contentful", async () => {
    const result = await runPlaygroundWorkflow({
      name: visualWorkflowCampaignPagesDraft.name,
      nodes: visualWorkflowCampaignPagesDraft.nodes,
      edges: visualWorkflowCampaignPagesDraft.edges,
      onStatus: () => undefined,
    });

    expect(result).toBe("completed");
  });
});
