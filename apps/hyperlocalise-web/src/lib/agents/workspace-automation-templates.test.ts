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
  getWorkspaceAutomationTemplate,
  getWorkspaceAutomationTemplateFlow,
  WORKSPACE_AUTOMATION_TEMPLATES_BASE,
} from "./workspace-automation-templates";

describe("workspace automation templates", () => {
  it("exposes an activatable source-upload translation template", () => {
    const template = getWorkspaceAutomationTemplate(
      "translate-on-source-upload",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "translate-on-source-upload",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "source_upload",
        translationEnabled: true,
        translationUseProjectTargetLocales: true,
      },
    });
  });

  it("builds the source-upload template flow with create job and translate tools", () => {
    const template = getWorkspaceAutomationTemplate(
      "translate-on-source-upload",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );
    expect(template).not.toBeNull();

    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "source-upload", label: "Source upload" },
      tools: [
        { id: "create-job", label: "Create job" },
        { id: "translate-with-agent", label: "Translate with agent" },
      ],
    });
  });
});
