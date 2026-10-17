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

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultConfig,
  getVisualNodeDimensions,
} from "@/lib/visual-workflows/catalog/node-catalog";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowConfigPanel } from "./visual-workflow-config-panel";

const resourceOptionsMock = vi.hoisted(() => ({
  resourceOptionsFor: vi.fn(() => [{ id: "repo-1", label: "acme/web", resourceKey: "acme/web" }]),
}));

vi.mock("./visual-workflow-resource-options", () => ({
  useVisualWorkflowResourceOptions: () => ({
    projects: [{ id: "project-1", name: "Acme" }],
    availableProviders: ["github"],
    workflows: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Enrich customer",
        publishedVersion: 3,
        publishedDefinition: {
          version: 3,
          nodes: [
            {
              id: "trigger",
              type: "trigger.manual",
              position: { x: 0, y: 0 },
              config: { kind: "trigger.manual" },
              outputFields: [{ path: "customerId", type: "string" }],
            },
            {
              id: "return",
              type: "flow.return",
              position: { x: 320, y: 0 },
              config: {
                kind: "flow.return",
                outputs: [{ id: "result-id", name: "result", type: "object" }],
              },
            },
          ],
          edges: [],
        },
      },
    ],
    resourceOptionsFor: resourceOptionsMock.resourceOptionsFor,
  }),
}));

/** Replaces the text of a setting's rich text box, as typing over all of it would. */
function replaceText(textbox: HTMLElement, text: string) {
  const editor = (textbox as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error("not a rich text box");
  act(() => {
    editor.chain().selectAll().insertContent(text).run();
  });
}

function renderPanel(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <IntlProvider locale="en" messages={{}}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </IntlProvider>
    ),
  });
}

function slackNode(id = "slack"): VisualWorkflowRfNode {
  return {
    id,
    type: "action.notify_slack",
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions("action.notify_slack"),
    data: {
      catalogType: "action.notify_slack",
      config: createDefaultConfig("action.notify_slack"),
      runStatus: "idle",
    },
  };
}

function triggerNode(type: VisualWorkflowRfNode["type"] = "trigger.manual"): VisualWorkflowRfNode {
  return {
    id: "t",
    type,
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions(type),
    data: {
      catalogType: type,
      config: createDefaultConfig(type),
      runStatus: "idle",
    },
  };
}

function waitNode(
  config: Extract<VisualWorkflowRfNode["data"]["config"], { kind: "flow.wait" }> = {
    kind: "flow.wait",
    mode: "duration",
    durationMs: 60_000,
  },
): VisualWorkflowRfNode {
  return {
    id: "wait",
    type: "flow.wait",
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions("flow.wait"),
    data: {
      catalogType: "flow.wait",
      config,
      runStatus: "idle",
    },
  };
}

function mergeNode(): VisualWorkflowRfNode {
  return {
    id: "merge",
    type: "logic.merge",
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions("logic.merge"),
    data: {
      catalogType: "logic.merge",
      config: {
        kind: "logic.merge",
        mode: "all",
        inputs: [
          { id: "email", name: "Email" },
          { id: "slack", name: "Slack" },
        ],
      },
      runStatus: "idle",
    },
  };
}

function sequenceNode(): VisualWorkflowRfNode {
  return {
    id: "sequence",
    type: "logic.sequence",
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions("logic.sequence"),
    data: {
      catalogType: "logic.sequence",
      config: {
        kind: "logic.sequence",
        outputs: [
          { id: "email", label: "Email" },
          { id: "slack", label: "Slack" },
        ],
      },
      runStatus: "idle",
    },
  };
}

function terminalNode(
  type: "flow.stop" | "flow.return" | "flow.fail",
  config: Extract<
    VisualWorkflowRfNode["data"]["config"],
    { kind: "flow.stop" | "flow.return" | "flow.fail" }
  >,
): VisualWorkflowRfNode {
  return {
    id: "terminal",
    type,
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions(type),
    data: { catalogType: type, config, runStatus: "idle" },
  };
}

function callWorkflowNode(): VisualWorkflowRfNode {
  return {
    id: "call",
    type: "flow.call_workflow",
    position: { x: 0, y: 0 },
    ...getVisualNodeDimensions("flow.call_workflow"),
    data: {
      catalogType: "flow.call_workflow",
      config: {
        kind: "flow.call_workflow",
        workflowId: "11111111-1111-4111-8111-111111111111",
        version: 3,
        inputFields: [{ id: "customerId", name: "customerId", type: "string", required: true }],
        outputFields: [{ id: "result-id", name: "result", type: "object", required: true }],
        onError: "stop",
      },
      runStatus: "idle",
    },
  };
}

describe("VisualWorkflowConfigPanel", () => {
  it("lets operators change the trigger type and delete the step", async () => {
    const user = userEvent.setup();
    const onChangeNodeType = vi.fn();
    const onDeleteNode = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={triggerNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={vi.fn()}
        onChangeNodeType={onChangeNodeType}
        onDeleteNode={onDeleteNode}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Trigger" }));
    await user.click(await screen.findByRole("option", { name: "GitHub" }));
    expect(onChangeNodeType).toHaveBeenCalledWith("trigger.github");

    // Delete sits in the panel's header beside Back, in the destructive style. Both are icons
    // that keep their names.
    const deleteStep = screen.getByRole("button", { name: "Delete step" });
    const back = screen.getByRole("button", { name: "Back" });
    expect(deleteStep.parentElement).toContainElement(back);
    expect(deleteStep).toHaveClass("text-destructive");
    expect(deleteStep).toHaveTextContent("");
    expect(back).toHaveTextContent("");
    await user.click(deleteStep);
    expect(onDeleteNode).toHaveBeenCalledOnce();
  });

  it("keeps Switch case ids when the case value changes", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();
    const node: VisualWorkflowRfNode = {
      id: "sw",
      type: "logic.switch",
      position: { x: 0, y: 0 },
      ...getVisualNodeDimensions("logic.switch"),
      data: {
        catalogType: "logic.switch",
        config: {
          kind: "logic.switch",
          expression: "status",
          cases: [
            { id: "case-pending", value: "pending" },
            { id: "case-ready", value: "ready" },
          ],
        },
        runStatus: "idle",
      },
    };

    renderPanel(
      <VisualWorkflowConfigPanel
        node={node}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Case 1"), "x");
    expect(onChangeConfig).toHaveBeenCalled();
    const lastConfig = onChangeConfig.mock.calls.at(-1)?.[0];
    expect(lastConfig).toMatchObject({
      kind: "logic.switch",
      cases: [
        { id: "case-pending", value: "pendingx" },
        { id: "case-ready", value: "ready" },
      ],
    });
  });

  it("persists default content sync resource options into node config", async () => {
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={triggerNode("action.content_sync")}
        organizationSlug="acme"
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    await vi.waitFor(() => {
      expect(onChangeConfig).toHaveBeenCalled();
    });

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "action.content_sync",
      connectionId: "repo-1",
      resourceKey: "acme/web",
      projectFolder: "github/acme/web",
    });
  });

  it("shows labeled pickers for content sync instead of raw ids", () => {
    renderPanel(
      <VisualWorkflowConfigPanel
        node={triggerNode("action.content_sync")}
        organizationSlug="acme"
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={vi.fn()}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Resource" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project folder")).toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub repository ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Project ID (optional)")).not.toBeInTheDocument();
  });

  it("configures a Wait node and changes its mode", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={waitNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Duration (ms)" })).toHaveTextContent("60000");

    await user.click(screen.getByRole("combobox", { name: "Wait mode" }));
    await user.click(await screen.findByRole("option", { name: "Until condition" }));

    expect(onChangeConfig).toHaveBeenCalledWith({
      kind: "flow.wait",
      mode: "condition",
      condition: "",
      pollingIntervalMs: 5_000,
      timeoutMs: 300_000,
    });
  });

  it("edits the bounded condition wait settings", async () => {
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={waitNode({
          kind: "flow.wait",
          mode: "condition",
          condition: "status === 'ready'",
          pollingIntervalMs: 5_000,
          timeoutMs: 300_000,
        })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Condition" })).toHaveTextContent(
      "status === 'ready'",
    );
    expect(screen.getByRole("textbox", { name: "Polling interval (ms)" })).toHaveTextContent(
      "5000",
    );
    expect(screen.getByRole("textbox", { name: "Timeout (ms)" })).toHaveTextContent("300000");
    replaceText(screen.getByRole("textbox", { name: "Timeout (ms)" }), "600000");

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "flow.wait",
      mode: "condition",
      condition: "status === 'ready'",
      pollingIntervalMs: 5_000,
      timeoutMs: 600_000,
    });
  });

  it("edits an absolute Wait timestamp", async () => {
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={waitNode({
          kind: "flow.wait",
          mode: "timestamp",
          timestamp: "2026-10-01T10:00:00.000Z",
        })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    const timestamp = screen.getByRole("textbox", { name: "Timestamp" });
    expect(timestamp).toHaveTextContent("2026-10-01T10:00:00.000Z");

    replaceText(timestamp, "2026-10-02T12:30:00.000Z");

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toEqual({
      kind: "flow.wait",
      mode: "timestamp",
      timestamp: "2026-10-02T12:30:00.000Z",
    });
  });

  it("renames a Merge input without changing its stable ID", () => {
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={mergeNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Input 1",
      }),
      {
        target: {
          value: "Customer email",
        },
      },
    );

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "logic.merge",
      inputs: [
        {
          id: "email",
          name: "Customer email",
        },
        {
          id: "slack",
          name: "Slack",
        },
      ],
    });
  });

  it("renames a Sequence output without changing its stable ID", () => {
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={sequenceNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Output 1",
      }),
      {
        target: {
          value: "Send customer email",
        },
      },
    );

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "logic.sequence",
      outputs: [
        {
          id: "email",
          label: "Send customer email",
        },
        {
          id: "slack",
          label: "Slack",
        },
      ],
    });
  });

  it("reorders Sequence outputs while preserving their stable IDs", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={sequenceNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Move output 2 up",
      }),
    );

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "logic.sequence",
      outputs: [
        {
          id: "slack",
          label: "Slack",
        },
        {
          id: "email",
          label: "Email",
        },
      ],
    });
  });

  it("removes a Sequence output by its position", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();

    renderPanel(
      <VisualWorkflowConfigPanel
        node={sequenceNode()}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove output 1",
      }),
    );

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "logic.sequence",
      outputs: [
        {
          id: "slack",
          label: "Slack",
        },
      ],
    });
  });

  it("configures a Stop reason", async () => {
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={terminalNode("flow.stop", { kind: "flow.stop", outcome: "completed" })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Reason (optional)" }), {
      target: { value: "Done early" },
    });
    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toEqual({
      kind: "flow.stop",
      outcome: "completed",
      reason: "Done early",
    });
  });

  it("renames a Return output without changing its stable ID", async () => {
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={terminalNode("flow.return", {
          kind: "flow.return",
          outputs: [{ id: "result-id", name: "result", type: "string" }],
        })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Returned output 1" }), {
      target: { value: "orderId" },
    });
    expect(onChangeConfig).toHaveBeenLastCalledWith({
      kind: "flow.return",
      outputs: [{ id: "result-id", name: "orderId", type: "string" }],
    });
  });

  it("generates a unique Return output name after outputs are renamed", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={terminalNode("flow.return", {
          kind: "flow.return",
          outputs: [{ id: "existing", name: "output2", type: "string" }],
        })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add returned output" }));

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toMatchObject({
      outputs: [
        { id: "existing", name: "output2", type: "string" },
        { name: "output3", type: "unknown" },
      ],
    });
  });

  it("marks the settings an issue names", () => {
    const slack = slackNode();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={slack}
        nodes={[slack]}
        issues={[
          { code: "invalid_node_config", nodeId: "slack", field: "channelId", reason: "required" },
          { code: "invalid_node_config", nodeId: "other", field: "message", reason: "required" },
        ]}
        onBack={vi.fn()}
        onChangeConfig={vi.fn()}
        onChangeContract={vi.fn()}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    expect(document.getElementById("vw-slack-channel")).toHaveAttribute("aria-invalid", "true");
    // An issue about another step's setting of the same name marks nothing here.
    expect(document.getElementById("vw-slack-message")).not.toHaveAttribute("aria-invalid");
  });

  describe("tabs", () => {
    function panel(
      node: VisualWorkflowRfNode,
      props: Partial<Parameters<typeof VisualWorkflowConfigPanel>[0]> = {},
    ) {
      return (
        <VisualWorkflowConfigPanel
          node={node}
          nodes={[node]}
          issues={[]}
          onBack={vi.fn()}
          onChangeConfig={vi.fn()}
          onChangeContract={vi.fn()}
          onChangeNodeType={vi.fn()}
          onDeleteNode={vi.fn()}
          {...props}
        />
      );
    }

    it("opens on the step's own form, with its outputs on a tab of their own", async () => {
      const user = userEvent.setup();
      renderPanel(panel(slackNode()));

      expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.queryByRole("tab", { name: "Inputs" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Slack channel ID")).toBeInTheDocument();
      expect(screen.queryByText("Output fields (path, type, optional)")).not.toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Outputs" }));
      expect(screen.getByText("Output fields (path, type, optional)")).toBeInTheDocument();
      // The tab names the part, so the part has no heading of its own.
      expect(screen.queryByRole("heading", { name: "Outputs" })).not.toBeInTheDocument();
    });

    it("keeps the chosen tab when another step is selected", async () => {
      const user = userEvent.setup();
      const { rerender } = renderPanel(panel(slackNode("first")));

      await user.click(screen.getByRole("tab", { name: "Outputs" }));
      rerender(panel(slackNode("second")));

      expect(screen.getByRole("tab", { name: "Outputs" })).toHaveAttribute("aria-selected", "true");
    });

    it("shows the step's own form when an issue about a setting is picked", async () => {
      const user = userEvent.setup();
      const slack = slackNode();
      renderPanel(
        panel(slack, {
          issues: [
            {
              code: "invalid_node_config",
              nodeId: "slack",
              field: "channelId",
              reason: "required",
            },
          ],
          onSelectNode: vi.fn(),
        }),
      );

      await user.click(screen.getByRole("tab", { name: "Outputs" }));
      await user.click(screen.getByText("channelId is required."));

      expect(screen.getByRole("tab", { name: "Configuration" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByLabelText("Slack channel ID")).toHaveAttribute("aria-invalid", "true");
    });

    it("shows which step feeds a wired setting, and can disconnect it", async () => {
      const user = userEvent.setup();
      const onDisconnectInput = vi.fn();
      const http: VisualWorkflowRfNode = {
        id: "http",
        type: "action.http",
        position: { x: 0, y: 0 },
        ...getVisualNodeDimensions("action.http"),
        data: {
          catalogType: "action.http",
          config: createDefaultConfig("action.http"),
          runStatus: "idle",
        },
      };
      renderPanel(
        panel(slackNode(), {
          nodes: [http, slackNode()],
          edges: [
            {
              id: "wire",
              source: "http",
              target: "slack",
              sourceHandle: "json.reviewers",
              targetHandle: "message",
              data: { kind: "data" },
            },
          ],
          onDisconnectInput,
        }),
      );

      expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
      expect(screen.getByText("HTTP Request")).toBeInTheDocument();
      expect(screen.getByText("› json › reviewers")).toBeInTheDocument();
      // The channel is still typed, and still has its port.
      expect(screen.getByRole("textbox", { name: "Slack channel ID" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Disconnect" }));
      expect(onDisconnectInput).toHaveBeenCalledWith("message");
    });

    it("puts a field of an earlier step into a setting's text from the Insert menu", async () => {
      const user = userEvent.setup();
      const onChangeConfig = vi.fn();
      const http: VisualWorkflowRfNode = {
        id: "http",
        type: "action.http",
        position: { x: 0, y: 0 },
        ...getVisualNodeDimensions("action.http"),
        data: {
          catalogType: "action.http",
          config: createDefaultConfig("action.http"),
          runStatus: "idle",
        },
      };
      const slack = slackNode();
      slack.data.config = { ...slack.data.config, message: "Hi " } as typeof slack.data.config;
      renderPanel(
        panel(slack, {
          nodes: [http, slack],
          edges: [{ id: "e", source: "http", target: "slack", data: { kind: "execution" } }],
          allTestData: { http: { json: { reviewers: "ana@acme.dev" } } },
          onChangeConfig,
        }),
      );

      await user.click(screen.getByRole("button", { name: "Insert a field into Message" }));
      // The menu's contents are hidden from the test DOM's accessibility tree, as the app's other
      // pickers are.
      await user.type(
        await screen.findByRole("combobox", { name: "Find a field", hidden: true }),
        "review",
      );
      await user.click(
        await screen.findByRole("option", { name: /json\.reviewers/, hidden: true }),
      );

      expect(onChangeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Hi {{ nodes.http.json.reviewers }}" }),
      );
    });

    it("shows the fields a setting reads as pills inside its text, and points at their steps", async () => {
      const user = userEvent.setup();
      const onPointStep = vi.fn();
      const onChangeConfig = vi.fn();
      const http: VisualWorkflowRfNode = {
        id: "http",
        type: "action.http",
        position: { x: 0, y: 0 },
        ...getVisualNodeDimensions("action.http"),
        data: {
          catalogType: "action.http",
          config: createDefaultConfig("action.http"),
          runStatus: "idle",
        },
      };
      const slack = slackNode();
      slack.data.config = {
        ...slack.data.config,
        message: "{{ nodes.http.json.count }} new strings",
      } as typeof slack.data.config;
      renderPanel(
        panel(slack, {
          nodes: [http, slack],
          edges: [{ id: "e", source: "http", target: "slack", data: { kind: "execution" } }],
          onPointStep,
          onChangeConfig,
        }),
      );

      const message = screen.getByRole("textbox", { name: "Message" });
      await waitFor(() => expect(message).toHaveTextContent("HTTP Request›json.count new strings"));
      const pill = screen.getByText("json.count").closest<HTMLElement>('[data-slot="field-pill"]')!;
      expect(pill).toHaveAttribute("title", "HTTP Request › json › count");
      expect(pill).not.toHaveAttribute("data-broken");

      await user.hover(pill);
      expect(onPointStep).toHaveBeenLastCalledWith("http");
      await user.unhover(pill);
      expect(onPointStep).toHaveBeenLastCalledWith(null);

      // Editing the text around a pill keeps the reference as it was written.
      const editor = (message as HTMLElement & { editor?: Editor }).editor!;
      act(() => {
        editor.chain().focus("end").insertContent(" today").run();
      });
      expect(onChangeConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: "{{ nodes.http.json.count }} new strings today" }),
      );
    });

    it("marks a pill whose step does not run before this one", async () => {
      const http: VisualWorkflowRfNode = {
        id: "http",
        type: "action.http",
        position: { x: 0, y: 0 },
        ...getVisualNodeDimensions("action.http"),
        data: {
          catalogType: "action.http",
          config: createDefaultConfig("action.http"),
          runStatus: "idle",
        },
      };
      const slack = slackNode();
      slack.data.config = {
        ...slack.data.config,
        message: "{{ nodes.http.json.count }} and {{ nodes.gone.status }}",
      } as typeof slack.data.config;
      renderPanel(panel(slack, { nodes: [http, slack], edges: [] }));

      const message = screen.getByRole("textbox", { name: "Message" });
      await waitFor(() =>
        expect(message.querySelectorAll('[data-slot="field-pill"]')).toHaveLength(2),
      );
      const pills = message.querySelectorAll('[data-slot="field-pill"]');
      expect(pills[0]).toHaveAttribute("data-broken", "true");
      expect(pills[0]).toHaveAttribute(
        "title",
        "HTTP Request › json › count cannot be read here: that step does not run before this one.",
      );
      expect(pills[1]).toHaveAttribute("data-broken", "true");
      expect(pills[1]).toHaveTextContent("gone›status");
    });

    it("turns a fixed value stored by an older version into the setting's own text", async () => {
      const user = userEvent.setup();
      const onChangeContract = vi.fn();
      const onChangeConfig = vi.fn();
      const slack = slackNode();
      slack.data.inputs = { channelId: { kind: "literal", value: "C123" } };
      renderPanel(panel(slack, { onChangeContract, onChangeConfig }));

      expect(screen.getByText("Fixed value")).toBeInTheDocument();
      expect(screen.getByText('› "C123"')).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Slack channel ID" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit as text" }));
      expect(onChangeConfig).toHaveBeenCalledWith(expect.objectContaining({ channelId: "C123" }));
      expect(onChangeContract).toHaveBeenCalledWith({ inputs: {} });
    });

    it("says so when a step has no settings", () => {
      const tryCatch: VisualWorkflowRfNode = {
        id: "tc",
        type: "logic.try_catch",
        position: { x: 0, y: 0 },
        data: {
          catalogType: "logic.try_catch",
          config: createDefaultConfig("logic.try_catch"),
          runStatus: "idle",
        },
      };
      renderPanel(panel(tryCatch));

      expect(
        screen.getByText("This step has nothing to set up. Its outputs are on the Outputs tab."),
      ).toBeInTheDocument();
    });

    it("keeps what happens on failure under its own heading", async () => {
      const user = userEvent.setup();
      renderPanel(panel(slackNode()));

      expect(screen.queryByRole("combobox", { name: "On error" })).not.toBeInTheDocument();
      const heading = screen.getByRole("button", { name: /If this step fails/ });
      expect(heading).toHaveTextContent("Stop workflow");

      await user.click(heading);
      expect(screen.getByRole("combobox", { name: "On error" })).toBeInTheDocument();
    });

    it("lists a step's wire-only inputs and asks for a wire", () => {
      const call: VisualWorkflowRfNode = {
        id: "call",
        type: "flow.call_workflow",
        position: { x: 0, y: 0 },
        ...getVisualNodeDimensions("flow.call_workflow"),
        data: {
          catalogType: "flow.call_workflow",
          config: {
            kind: "flow.call_workflow",
            workflowId: "11111111-1111-4111-8111-111111111111",
            version: 3,
            inputFields: [{ id: "customerId", name: "customerId", type: "string" }],
            outputFields: [],
          },
          runStatus: "idle",
        },
      };
      renderPanel(panel(call));

      expect(screen.getByText("Connect this on the canvas.")).toBeInTheDocument();
      expect(screen.getByText("customerId", { selector: "label" })).toBeInTheDocument();
    });

    it("has no tabs when the step's inputs and outputs cannot be changed", () => {
      renderPanel(panel(slackNode(), { onChangeContract: undefined }));

      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Configure step" })).toBeInTheDocument();
      expect(screen.getByLabelText("Slack channel ID")).toBeInTheDocument();
    });
  });

  it("configures a controlled Fail code and message", () => {
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={terminalNode("flow.fail", {
          kind: "flow.fail",
          errorCode: "WORKFLOW_FAILED",
          message: "Workflow failed",
        })}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Error code" }), {
      target: { value: "ORDER_REJECTED" },
    });
    expect(onChangeConfig).toHaveBeenLastCalledWith({
      kind: "flow.fail",
      errorCode: "ORDER_REJECTED",
      message: "Workflow failed",
    });
  });

  it("configures a published workflow and its immutable contract", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();
    renderPanel(
      <VisualWorkflowConfigPanel
        node={callWorkflowNode()}
        organizationSlug="acme"
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={onChangeConfig}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
      />,
    );

    expect(screen.getByText("customerId")).toBeInTheDocument();
    expect(screen.getByText("result")).toBeInTheDocument();
    expect(screen.getAllByText("object · required")).toHaveLength(1);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Immutable version" }), {
      target: { value: "4" },
    });
    expect(onChangeConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "flow.call_workflow", version: 4 }),
    );

    await user.click(screen.getByRole("combobox", { name: "Published workflow" }));
    await user.click(await screen.findByRole("option", { name: "Enrich customer · v3" }));
    expect(onChangeConfig).toHaveBeenLastCalledWith({
      kind: "flow.call_workflow",
      workflowId: "11111111-1111-4111-8111-111111111111",
      version: 3,
      inputFields: [{ id: "customerId", name: "customerId", type: "string", required: true }],
      outputFields: [{ id: "result-id", name: "result", type: "object", required: true }],
      onError: "stop",
    });
  });
});

describe("Test tab", () => {
  function panel(
    node: VisualWorkflowRfNode,
    props: Partial<Parameters<typeof VisualWorkflowConfigPanel>[0]> = {},
  ) {
    return (
      <VisualWorkflowConfigPanel
        node={node}
        nodes={[node]}
        issues={[]}
        onBack={vi.fn()}
        onChangeConfig={vi.fn()}
        onChangeContract={vi.fn()}
        onChangeNodeType={vi.fn()}
        onDeleteNode={vi.fn()}
        onChangeTestData={vi.fn()}
        {...props}
      />
    );
  }

  it("is offered on triggers and steps that call out, not on steps that compute", () => {
    const { rerender } = renderPanel(panel(slackNode()));
    expect(screen.getByRole("tab", { name: "Test" })).toBeInTheDocument();

    const set: VisualWorkflowRfNode = {
      ...slackNode("set"),
      type: "logic.set",
      data: {
        catalogType: "logic.set",
        config: createDefaultConfig("logic.set"),
        runStatus: "idle",
      },
    };
    rerender(panel(set));
    expect(screen.queryByRole("tab", { name: "Test" })).not.toBeInTheDocument();
  });

  it("opens when asked from outside, with a box per output and the missing ones marked", async () => {
    renderPanel(
      panel(slackNode(), {
        testData: { sent: true },
        missingTestValues: [{ nodeId: "slack", path: "channelId", reason: "required" }],
        requestedTab: { tab: "test", key: 1 },
      }),
    );

    expect(await screen.findByRole("tab", { name: "Test" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("textbox", { name: /channelId/ })).toHaveValue("");
    expect(screen.getByText("Needed for a test run.")).toBeInTheDocument();
  });

  it("sets a value as it is typed and fills the rest with visible examples", async () => {
    const user = userEvent.setup();
    const onChangeTestData = vi.fn();
    renderPanel(panel(slackNode(), { onChangeTestData, requestedTab: { tab: "test", key: 1 } }));

    await user.type(await screen.findByRole("textbox", { name: /channelId/ }), "C");
    expect(onChangeTestData).toHaveBeenLastCalledWith({ channelId: "C" });

    await user.click(screen.getByRole("button", { name: "Fill with examples" }));
    expect(onChangeTestData).toHaveBeenLastCalledWith({ sent: true, channelId: "mock-channel" });
  });

  it("copies the step's output from the last run, and is off when there was none", async () => {
    const user = userEvent.setup();
    const onChangeTestData = vi.fn();
    const ran = slackNode();
    ran.data.lastOutput = { sent: true, channelId: "C9", simulated: true };
    const { rerender } = renderPanel(
      panel(slackNode(), { onChangeTestData, requestedTab: { tab: "test", key: 1 } }),
    );
    expect(await screen.findByRole("button", { name: "Use last run" })).toBeDisabled();

    rerender(panel(ran, { onChangeTestData, requestedTab: { tab: "test", key: 1 } }));
    await user.click(screen.getByRole("button", { name: "Use last run" }));
    expect(onChangeTestData).toHaveBeenLastCalledWith({ sent: true, channelId: "C9" });
  });

  it("offers the workspace's projects for a source upload trigger's project", async () => {
    renderPanel(
      panel(triggerNode("trigger.source_upload"), { requestedTab: { tab: "test", key: 1 } }),
    );

    expect(await screen.findByRole("combobox", { name: /projectId/ })).toHaveTextContent(
      "Choose a project",
    );
    expect(screen.getByRole("textbox", { name: /sourceFileId/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /triggeredAt/ })).not.toBeInTheDocument();
  });
});
