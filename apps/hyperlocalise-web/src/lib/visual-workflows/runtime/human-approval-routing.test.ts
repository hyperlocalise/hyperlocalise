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

import type { CanonicalVisualWorkflowEdge } from "../schema/types";
import { selectNextEdges } from "./graph-index";

const outgoing: CanonicalVisualWorkflowEdge[] = [
  "approved",
  "rejected",
  "changes_requested",
  "timed_out",
].map((sourceHandle) => ({
  id: `edge-${sourceHandle}`,
  source: "approval",
  target: `after-${sourceHandle}`,
  sourceHandle,
  targetHandle: null,
}));

describe("Human Approval routing", () => {
  it.each(["approved", "rejected", "changes_requested", "timed_out"])(
    "selects only the %s execution branch",
    (switchCase) => {
      expect(
        selectNextEdges({
          nodeType: "flow.human_approval",
          branchResult: null,
          switchCase,
          useErrorBranch: false,
          outgoing,
        }).map((edge) => edge.sourceHandle),
      ).toEqual([switchCase]);
    },
  );

  it("does not release every branch when no decision is available", () => {
    expect(
      selectNextEdges({
        nodeType: "flow.human_approval",
        branchResult: null,
        switchCase: null,
        useErrorBranch: false,
        outgoing,
      }),
    ).toEqual([]);
  });
});
