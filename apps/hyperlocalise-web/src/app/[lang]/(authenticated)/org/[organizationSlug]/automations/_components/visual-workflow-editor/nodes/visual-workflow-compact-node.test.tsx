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
import { render } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createDefaultConfig,
  isTriggerType,
  VISUAL_NODE_CATALOG,
} from "@/lib/visual-workflows/catalog/node-catalog";
import type { VisualNodeConfig, VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";
import { getAllowedExecutionSourceHandles } from "@/lib/visual-workflows/validation/execution-handles";

import { VisualWorkflowCanvasActionsProvider } from "../visual-workflow-canvas-actions";
import { VisualWorkflowCompactNode } from "./visual-workflow-compact-node";

const updateNodeInternals = vi.hoisted(() => vi.fn());

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useUpdateNodeInternals: () => updateNodeInternals,
}));

const NODE_TYPES = { step: VisualWorkflowCompactNode };

function step(type: VisualWorkflowRfNode["data"]["catalogType"], config: VisualNodeConfig) {
  const node = {
    id: "step",
    type: "step",
    position: { x: 0, y: 0 },
    data: { catalogType: type, config, runStatus: "idle" },
  } as unknown as VisualWorkflowRfNode;
  return (
    <IntlProvider locale="en" messages={{}}>
      <TooltipProvider>
        <VisualWorkflowCanvasActionsProvider onAddFromNode={() => {}}>
          <ReactFlowProvider>
            <div style={{ width: 800, height: 600 }}>
              <ReactFlow nodes={[node]} edges={[]} nodeTypes={NODE_TYPES} />
            </div>
          </ReactFlowProvider>
        </VisualWorkflowCanvasActionsProvider>
      </TooltipProvider>
    </IntlProvider>
  );
}

function renderStep(type: VisualWorkflowRfNode["data"]["catalogType"], config: VisualNodeConfig) {
  return render(step(type, config));
}

const STEPS = VISUAL_NODE_CATALOG.filter(
  (item) => item.enabled && !isTriggerType(item.type),
).flatMap((item) => {
  const config = createDefaultConfig(item.type);
  return "onError" in config
    ? [
        { type: item.type, config },
        { type: item.type, config: { ...config, onError: "branch" as const } },
      ]
    : [{ type: item.type, config }];
});

describe("VisualWorkflowCompactNode", () => {
  it.each(STEPS)(
    "draws $type's execution outputs as the compiler lists them, evenly spaced",
    ({ type, config }) => {
      const { container } = renderStep(type, config);

      const drawn = [
        ...container.querySelectorAll<HTMLElement>(".react-flow__handle.source[data-handleid]"),
      ].filter((handle) => !handle.getAttribute("aria-label")?.startsWith("Data output"));
      const expected = getAllowedExecutionSourceHandles({ type, config }).filter(
        (handle) => handle !== null,
      );

      expect(drawn.map((handle) => handle.dataset.handleid)).toEqual(expected);
      if (drawn.length > 1) {
        expect(drawn.map((handle) => handle.style.top)).toEqual(
          drawn.map((_, index) =>
            expect.stringContaining(`* ${(index + 1) / (drawn.length + 1)})`),
          ),
        );
      }
    },
  );

  it("gives a data output its own handle id beside an execution output of the same name", () => {
    const { container } = renderStep("action.file_read", createDefaultConfig("action.file_read"));

    const errorHandles = [
      ...container.querySelectorAll<HTMLElement>(".react-flow__handle.source"),
    ].filter((handle) => handle.dataset.handleid?.endsWith("error"));

    expect(errorHandles.map((handle) => handle.dataset.handleid)).toEqual(["error", "data:error"]);
  });

  it("has React Flow measure the step again when a handle is added", () => {
    const config = createDefaultConfig("action.http");
    const { rerender } = renderStep("action.http", config);
    updateNodeInternals.mockClear();

    rerender(step("action.http", { ...config, onError: "stop" } as VisualNodeConfig));
    expect(updateNodeInternals).not.toHaveBeenCalled();

    rerender(step("action.http", { ...config, onError: "branch" } as VisualNodeConfig));
    expect(updateNodeInternals).toHaveBeenCalledWith("step");
  });

  it("names a Switch case by its position, whatever its id", () => {
    const { container } = renderStep("logic.switch", {
      kind: "logic.switch",
      expression: "status",
      cases: [
        { id: "success", value: "ok" },
        { id: "failed", value: "failed" },
      ],
    });

    expect(
      [
        ...container.querySelectorAll(".react-flow__handle.source:not([data-handleid^='data:'])"),
      ].map((handle) => handle.getAttribute("aria-label")),
    ).toEqual(["Case 1", "Case 2", "default"]);
  });
});
