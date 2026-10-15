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

import type { VisualWorkflowRfEdge } from "../schema/types";
import { isExecutionHandleConnected } from "./visual-workflow-execution-ports";

const edges: VisualWorkflowRfEdge[] = [
  { id: "e1", source: "trigger", target: "http", sourceHandle: null, targetHandle: null },
  {
    id: "e2",
    source: "branch",
    target: "slack",
    sourceHandle: "false",
    targetHandle: "input",
    data: { kind: "execution" },
  },
  {
    id: "e3",
    source: "trigger",
    target: "http",
    sourceHandle: "triggeredAt",
    targetHandle: "url",
    data: { kind: "data" },
  },
];

describe("isExecutionHandleConnected", () => {
  it("attaches a wire without handle ids to the main output and the input", () => {
    expect(isExecutionHandleConnected(edges, "trigger", "source", "success")).toBe(true);
    expect(isExecutionHandleConnected(edges, "http", "target", "input")).toBe(true);
  });

  it("matches a wire by its handle id", () => {
    expect(isExecutionHandleConnected(edges, "branch", "source", "false")).toBe(true);
    expect(isExecutionHandleConnected(edges, "branch", "source", "true")).toBe(false);
    expect(isExecutionHandleConnected(edges, "slack", "target", "input")).toBe(true);
  });

  it("ignores data wires", () => {
    expect(isExecutionHandleConnected(edges, "trigger", "source", "triggeredAt")).toBe(false);
    expect(isExecutionHandleConnected(edges, "http", "target", "url")).toBe(false);
  });
});
