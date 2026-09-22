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

import { applyVisualWorkflowConnection } from "./visual-workflow-canvas";

describe("applyVisualWorkflowConnection", () => {
  it("creates an execution edge for execution ports", () => {
    const [edge] = applyVisualWorkflowConnection([], {
      source: "trigger",
      target: "request",
      sourceHandle: "success",
      targetHandle: "input",
    });

    expect(edge).toMatchObject({
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    });
  });

  it("normalizes omitted execution handles to stable port IDs", () => {
    const [edge] = applyVisualWorkflowConnection([], {
      source: "trigger",
      target: "request",
      sourceHandle: null,
      targetHandle: null,
    });

    expect(edge).toMatchObject({
      sourceHandle: "success",
      targetHandle: "input",
      data: { kind: "execution" },
    });
  });

  it("creates a data edge and keeps its stable port IDs", () => {
    const [edge] = applyVisualWorkflowConnection([], {
      source: "trigger",
      target: "request",
      sourceHandle: "triggeredAt",
      targetHandle: "url",
    });

    expect(edge).toMatchObject({
      sourceHandle: "triggeredAt",
      targetHandle: "url",
      data: { kind: "data" },
      label: "triggeredAt → url",
      style: { strokeDasharray: "5 4" },
    });
  });
});
