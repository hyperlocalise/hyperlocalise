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

import {
  buildWorkflowEdges,
  buildWorkflowNodes,
  inferWorkflowStepActor,
} from "@/lib/integrations/integration-workflow-graph";

const integrationNames = {
  github: "GitHub",
  slack: "Slack",
  crowdin: "Crowdin",
  hyperlocalise: "Hyperlocalise",
};

describe("integration-workflow-graph", () => {
  it("infers hyperlocalise actors from labels", () => {
    expect(
      inferWorkflowStepActor("Hyperlocalise scans strings", 1, "github", integrationNames),
    ).toBe("hyperlocalise");
  });

  it("infers related integrations from labels", () => {
    expect(
      inferWorkflowStepActor("Reviewer notified in Slack", 2, "github", integrationNames),
    ).toBe("slack");
  });

  it("builds linear workflow edges", () => {
    expect(buildWorkflowEdges("github-wf-0", 3)).toEqual([
      { id: "github-wf-0-edge-0", source: "github-wf-0-node-0", target: "github-wf-0-node-1" },
      { id: "github-wf-0-edge-1", source: "github-wf-0-node-1", target: "github-wf-0-node-2" },
    ]);
  });

  it("builds workflow nodes with trigger and action kinds", () => {
    const nodes = buildWorkflowNodes(
      {
        title: "Catch missing translations before merge",
        steps: [
          { label: "PR opened on GitHub" },
          { label: "Hyperlocalise scans strings" },
          { label: "Reviewer notified in Slack" },
        ],
      },
      "github-wf-0",
      "github",
      integrationNames,
      { trigger: "Trigger", action: "Action" },
      1,
    );

    expect(nodes).toHaveLength(3);
    expect(nodes[0]?.data.kind).toBe("trigger");
    expect(nodes[1]?.data.kind).toBe("action");
    expect(nodes[1]?.data.active).toBe(true);
    expect(nodes[1]?.data.actorSlug).toBe("hyperlocalise");
    expect(nodes[2]?.data.actorSlug).toBe("slack");
  });
});
