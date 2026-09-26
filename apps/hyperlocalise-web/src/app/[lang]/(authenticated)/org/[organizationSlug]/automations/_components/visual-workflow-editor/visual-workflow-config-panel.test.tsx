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
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultConfig,
  getVisualNodeDimensions,
} from "@/lib/visual-workflows/catalog/node-catalog";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import { VisualWorkflowConfigPanel } from "./visual-workflow-config-panel";

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

describe("VisualWorkflowConfigPanel", () => {
  it("lets operators change the trigger type and delete the step", async () => {
    const user = userEvent.setup();
    const onChangeNodeType = vi.fn();
    const onDeleteNode = vi.fn();

    render(
      <IntlProvider locale="en" messages={{}}>
        <VisualWorkflowConfigPanel
          node={triggerNode()}
          issues={[]}
          onBack={vi.fn()}
          onChangeConfig={vi.fn()}
          onChangeNodeType={onChangeNodeType}
          onDeleteNode={onDeleteNode}
        />
      </IntlProvider>,
    );

    await user.click(screen.getByRole("combobox", { name: "Trigger" }));
    await user.click(await screen.findByRole("option", { name: "GitHub" }));
    expect(onChangeNodeType).toHaveBeenCalledWith("trigger.github");

    await user.click(screen.getByRole("button", { name: "Delete step" }));
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

    render(
      <IntlProvider locale="en" messages={{}}>
        <VisualWorkflowConfigPanel
          node={node}
          issues={[]}
          onBack={vi.fn()}
          onChangeConfig={onChangeConfig}
          onChangeNodeType={vi.fn()}
          onDeleteNode={vi.fn()}
        />
      </IntlProvider>,
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

  it("configures a Wait node and changes its mode", async () => {
    const user = userEvent.setup();
    const onChangeConfig = vi.fn();

    render(
      <IntlProvider locale="en" messages={{}}>
        <VisualWorkflowConfigPanel
          node={waitNode()}
          issues={[]}
          onBack={vi.fn()}
          onChangeConfig={onChangeConfig}
          onChangeNodeType={vi.fn()}
          onDeleteNode={vi.fn()}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("textbox", { name: "Duration (ms)" })).toHaveValue("60000");

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

    render(
      <IntlProvider locale="en" messages={{}}>
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
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("textbox", { name: "Condition" })).toHaveValue("status === 'ready'");
    expect(screen.getByRole("textbox", { name: "Polling interval (ms)" })).toHaveValue("5000");
    expect(screen.getByRole("textbox", { name: "Timeout (ms)" })).toHaveValue("300000");
    const timeout = screen.getByRole("textbox", { name: "Timeout (ms)" });
    fireEvent.change(timeout, {
      target: { value: "600000" },
    });

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

    render(
      <IntlProvider locale="en" messages={{}}>
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
        />
      </IntlProvider>,
    );

    const timestamp = screen.getByRole("textbox", { name: "Timestamp" });
    expect(timestamp).toHaveValue("2026-10-01T10:00:00.000Z");

    fireEvent.change(timestamp, { target: { value: "2026-10-02T12:30:00.000Z" } });

    expect(onChangeConfig.mock.calls.at(-1)?.[0]).toEqual({
      kind: "flow.wait",
      mode: "timestamp",
      timestamp: "2026-10-02T12:30:00.000Z",
    });
  });
});
