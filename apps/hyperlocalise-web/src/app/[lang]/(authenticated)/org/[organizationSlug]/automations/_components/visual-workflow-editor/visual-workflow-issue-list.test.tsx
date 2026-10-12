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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultConfig,
  getVisualNodeDimensions,
} from "@/lib/visual-workflows/catalog/node-catalog";
import type { VisualCatalogType, VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowIssueList } from "./visual-workflow-issue-list";

const STEP_CONFIGURATION = "Fix the step configuration before saving this workflow.";

function node(id: string, type: VisualCatalogType): VisualWorkflowRfNode {
  const config = createDefaultConfig(type);
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions(type, config),
    data: { catalogType: type, config, runStatus: "idle" },
  };
}

function renderList(props: ComponentProps<typeof VisualWorkflowIssueList>) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <VisualWorkflowIssueList {...props} />
    </IntlProvider>,
  );
}

describe("VisualWorkflowIssueList", () => {
  it("names the step an issue is about and selects it when clicked", async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    renderList({
      issues: [
        { code: "invalid_node_config", nodeId: "request" },
        { code: "invalid_node_config", nodeId: "notify" },
      ],
      nodes: [node("request", "action.http"), node("notify", "action.notify_slack")],
      onSelectNode,
    });

    const request = screen.getByRole("button", { name: `HTTP Request ${STEP_CONFIGURATION}` });
    expect(
      screen.getByRole("button", { name: `Notify Slack ${STEP_CONFIGURATION}` }),
    ).toBeInTheDocument();

    await user.click(request);

    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith("request");
  });

  it("says which setting is at fault and why, where the validator knows", () => {
    renderList({
      issues: [
        { code: "invalid_node_config", nodeId: "notify", field: "channelId", reason: "required" },
        { code: "invalid_node_config", nodeId: "notify", field: "message", reason: "required" },
        {
          code: "invalid_trigger_config",
          nodeId: "schedule",
          field: "schedule",
          reason: "invalid",
        },
        { code: "invalid_node_config", nodeId: "request", reason: "literal_credential" },
      ],
      nodes: [
        node("notify", "action.notify_slack"),
        node("schedule", "trigger.scheduled"),
        node("request", "action.http"),
      ],
      onSelectNode: vi.fn(),
    });

    expect(
      screen.getByRole("button", { name: "Notify Slack channelId is required." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notify Slack message is required." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule schedule is not valid." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "HTTP Request Use a saved credential for secret values instead of typing them into the step.",
      }),
    ).toBeInTheDocument();
  });

  it("leaves an issue about no step as plain text", () => {
    renderList({
      issues: [{ code: "missing_trigger" }],
      nodes: [node("request", "action.http")],
      onSelectNode: vi.fn(),
    });

    expect(screen.getByText("Add a trigger to start the workflow.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows one problem with one step once", () => {
    renderList({
      issues: [
        { code: "invalid_node_config", nodeId: "request" },
        { code: "invalid_node_config", nodeId: "request" },
      ],
      nodes: [node("request", "action.http")],
      onSelectNode: vi.fn(),
    });

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("names the step without a button where nothing can select it", () => {
    renderList({
      issues: [{ code: "invalid_node_config", nodeId: "request" }],
      nodes: [node("request", "action.http")],
    });

    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when the workflow has no issues", () => {
    renderList({ issues: [], nodes: [], onSelectNode: vi.fn() });

    expect(screen.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  });
});
