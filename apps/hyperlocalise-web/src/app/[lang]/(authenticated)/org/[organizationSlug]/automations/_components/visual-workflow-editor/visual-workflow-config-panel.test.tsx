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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { createDefaultConfig, getVisualNodeDimensions } from "@/lib/visual-workflows/catalog/node-catalog";
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
});
