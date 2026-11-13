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

import {
  buildAutomationsDetailHref,
  parseWorkspaceAutomationEditorTab,
} from "./workspace-automation-editor-tab";

describe("workspace-automation-editor-tab", () => {
  it("parses editor tab query values", () => {
    expect(parseWorkspaceAutomationEditorTab("history")).toBe("history");
    expect(parseWorkspaceAutomationEditorTab("settings")).toBe("settings");
    expect(parseWorkspaceAutomationEditorTab("runs")).toBeNull();
  });

  it("builds project automation detail links with run history tab", () => {
    expect(
      buildAutomationsDetailHref("acme", {
        projectId: "proj_1",
        automationId: "auto_1",
        tab: "history",
      }),
    ).toBe("/org/acme/projects/proj_1/automations/auto_1?tab=history");
  });
});
