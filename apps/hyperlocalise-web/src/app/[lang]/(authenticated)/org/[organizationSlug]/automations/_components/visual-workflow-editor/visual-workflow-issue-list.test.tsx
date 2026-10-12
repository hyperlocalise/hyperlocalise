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

function list(props: ComponentProps<typeof VisualWorkflowIssueList>) {
  return (
    <IntlProvider locale="en" messages={{}}>
      <VisualWorkflowIssueList {...props} />
    </IntlProvider>
  );
}

function renderList(props: ComponentProps<typeof VisualWorkflowIssueList>) {
  return render(list(props));
}

const NODES = [
  node("request", "action.http"),
  node("notify", "action.notify_slack"),
  node("schedule", "trigger.scheduled"),
];

const THREE_STOPS: ComponentProps<typeof VisualWorkflowIssueList>["issues"] = [
  { code: "invalid_node_config", nodeId: "request", reason: "literal_credential" },
  { code: "invalid_node_config", nodeId: "notify", field: "channelId", reason: "required" },
  { code: "missing_trigger" },
  { code: "invalid_node_config", nodeId: "notify", field: "message", reason: "invalid" },
];

describe("VisualWorkflowIssueList", () => {
  it("names the step an issue is about and selects it when clicked", async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    renderList({
      issues: [{ code: "invalid_node_config", nodeId: "request" }],
      nodes: NODES,
      onSelectNode,
    });

    await user.click(screen.getByRole("button", { name: `HTTP Request ${STEP_CONFIGURATION}` }));

    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith("request");
    // One stop needs no arrows.
    expect(screen.queryByRole("button", { name: "Next issue" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Issue \d/)).not.toBeInTheDocument();
  });

  it("shows one step at a time, with everything wrong with it and why", () => {
    renderList({ issues: THREE_STOPS, nodes: NODES, onSelectNode: vi.fn() });

    expect(screen.getByText("Issue 1 of 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "HTTP Request Use a saved credential for secret values instead of typing them into the step.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Notify Slack")).not.toBeInTheDocument();
    expect(screen.queryByText("Add a trigger to start the workflow.")).not.toBeInTheDocument();
  });

  it("moves with the arrows, around the ends, and selects the step it lands on", async () => {
    const user = userEvent.setup();
    const onSelectNode = vi.fn();
    renderList({ issues: THREE_STOPS, nodes: NODES, onSelectNode });

    await user.click(screen.getByRole("button", { name: "Next issue" }));

    expect(screen.getByText("Issue 2 of 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Notify Slack channelId is required. message is not valid.",
      }),
    ).toBeInTheDocument();
    expect(onSelectNode).toHaveBeenLastCalledWith("notify");

    await user.click(screen.getByRole("button", { name: "Next issue" }));

    // An issue about no step is a stop with nothing to select.
    expect(screen.getByText("Issue 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("Add a trigger to start the workflow.")).toBeInTheDocument();
    expect(onSelectNode).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Next issue" }));

    expect(screen.getByText("Issue 1 of 3")).toBeInTheDocument();
    expect(onSelectNode).toHaveBeenLastCalledWith("request");

    await user.click(screen.getByRole("button", { name: "Previous issue" }));

    expect(screen.getByText("Issue 3 of 3")).toBeInTheDocument();
  });

  it("starts at the step whose settings are open and follows it", () => {
    const props = { issues: THREE_STOPS, nodes: NODES, onSelectNode: vi.fn() };
    const view = renderList({ ...props, selectedNodeId: "notify" });

    expect(screen.getByText("Issue 2 of 3")).toBeInTheDocument();

    view.rerender(list({ ...props, selectedNodeId: "request" }));

    expect(screen.getByText("Issue 1 of 3")).toBeInTheDocument();

    // A step with nothing wrong leaves the pager where it is.
    view.rerender(list({ ...props, selectedNodeId: "schedule" }));

    expect(screen.getByText("Issue 1 of 3")).toBeInTheDocument();
  });

  it("moves on to the next stop when a fix takes the shown one away", async () => {
    const user = userEvent.setup();
    const props = { nodes: NODES, onSelectNode: vi.fn() };
    const view = renderList({ ...props, issues: THREE_STOPS });
    await user.click(screen.getByRole("button", { name: "Next issue" }));

    view.rerender(
      list({ ...props, issues: THREE_STOPS.filter((issue) => issue.nodeId !== "notify") }),
    );

    expect(screen.getByText("Issue 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Add a trigger to start the workflow.")).toBeInTheDocument();
  });

  it("leaves an issue about no step as plain text", () => {
    renderList({
      issues: [{ code: "missing_trigger" }],
      nodes: NODES,
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
      nodes: NODES,
      onSelectNode: vi.fn(),
    });

    expect(screen.getAllByText(STEP_CONFIGURATION)).toHaveLength(1);
  });

  it("names the step without a button where nothing can select it", () => {
    renderList({
      issues: [{ code: "invalid_node_config", nodeId: "request" }],
      nodes: NODES,
    });

    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when the workflow has no issues", () => {
    renderList({ issues: [], nodes: [], onSelectNode: vi.fn() });

    expect(screen.queryByTestId("visual-workflow-validation-issues")).not.toBeInTheDocument();
  });
});
