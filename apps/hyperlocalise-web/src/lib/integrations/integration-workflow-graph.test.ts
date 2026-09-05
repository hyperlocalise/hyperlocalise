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
  inferWorkflowStepCatalogType,
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

  it("maps example steps onto visual workflow catalog types", () => {
    expect(inferWorkflowStepCatalogType("PR opened on GitHub", 0, "github")).toBe("trigger.github");
    expect(inferWorkflowStepCatalogType("Hyperlocalise scans strings", 1, "hyperlocalise")).toBe(
      "ai.agent",
    );
    expect(inferWorkflowStepCatalogType("Reviewer notified in Slack", 2, "slack")).toBe(
      "action.notify_slack",
    );
    expect(inferWorkflowStepCatalogType("Fix PR opened on GitHub", 2, "github")).toBe(
      "action.http",
    );
    expect(inferWorkflowStepCatalogType("New strings submitted", 0, "slack")).toBe(
      "trigger.manual",
    );
  });

  it("builds linear workflow edges", () => {
    expect(buildWorkflowEdges("github-wf-0", 3)).toEqual([
      { id: "github-wf-0-edge-0", source: "github-wf-0-node-0", target: "github-wf-0-node-1" },
      { id: "github-wf-0-edge-1", source: "github-wf-0-node-1", target: "github-wf-0-node-2" },
    ]);
  });

  it("builds compact visual workflow nodes left to right", () => {
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
      1,
    );

    expect(nodes).toHaveLength(3);
    expect(nodes[0]?.type).toBe("trigger.github");
    expect(nodes[0]?.position).toEqual({ x: 0, y: 0 });
    expect(nodes[1]?.type).toBe("ai.agent");
    expect(nodes[1]?.position).toEqual({ x: 260, y: 0 });
    expect(nodes[1]?.data.runStatus).toBe("running");
    expect(nodes[1]?.data.previewSubtitle).toBe("Hyperlocalise scans strings");
    expect(nodes[1]?.data.hideAddAction).toBe(true);
    expect(nodes[2]?.type).toBe("action.notify_slack");
    expect(nodes[2]?.position).toEqual({ x: 520, y: 0 });
  });
});
