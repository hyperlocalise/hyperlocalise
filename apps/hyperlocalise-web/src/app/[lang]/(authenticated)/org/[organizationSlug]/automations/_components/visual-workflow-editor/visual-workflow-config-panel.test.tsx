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
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
    resourceOptionsFor: resourceOptionsMock.resourceOptionsFor,
  }),
}));

function renderPanel(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </IntlProvider>,
  );
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
});
