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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  isSupportedWorkspaceAutomationKnowledgeFilename,
  WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES,
} from "./workspace-automation-knowledge-constants";

describe("workspace automation knowledge constants", () => {
  it("accepts document filenames used for agent knowledge", () => {
    expect(isSupportedWorkspaceAutomationKnowledgeFilename("policy.pdf")).toBe(true);
    expect(isSupportedWorkspaceAutomationKnowledgeFilename("notes.MD")).toBe(true);
    expect(isSupportedWorkspaceAutomationKnowledgeFilename("guide.docx")).toBe(true);
    expect(isSupportedWorkspaceAutomationKnowledgeFilename("photo.png")).toBe(false);
    expect(WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS).toEqual([
      ".pdf",
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      ".docx",
    ]);
    expect(WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES).toBe(20);
    expect(WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it("does not import drizzle or unpdf from the knowledge files client panel", () => {
    const panelSource = readFileSync(
      new URL(
        "../../app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-knowledge-files-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(panelSource).not.toMatch(
      /from ["']@\/lib\/agents\/workspace-automation-knowledge-files["']/,
    );
    expect(panelSource).not.toMatch(
      /from ["']@\/lib\/agents\/workspace-automation-knowledge-text["']/,
    );
    expect(panelSource).toMatch(
      /from ["']@\/lib\/agents\/workspace-automation-knowledge-constants["']/,
    );
  });
});
