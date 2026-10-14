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

import { nextVisualWorkflowNodeId } from "./visual-workflow-node-id";

describe("nextVisualWorkflowNodeId", () => {
  it("names a step by its kind", () => {
    expect(nextVisualWorkflowNodeId("action.notify_slack", [])).toBe("notify_slack");
    expect(nextVisualWorkflowNodeId("trigger.manual", [])).toBe("manual");
    expect(nextVisualWorkflowNodeId("logic.for_each", [])).toBe("for_each");
  });

  it("numbers a second step of the same kind, skipping numbers in use", () => {
    const nodes = [{ id: "http" }, { id: "http_2" }, { id: "slack" }];
    expect(nextVisualWorkflowNodeId("action.http", nodes)).toBe("http_3");
    expect(nextVisualWorkflowNodeId("action.notify_slack", nodes)).toBe("notify_slack");
  });
});
