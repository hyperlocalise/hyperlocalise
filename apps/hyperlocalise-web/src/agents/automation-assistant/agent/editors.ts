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
import type { Tool } from "ai";

import type { AutomationAssistantPageContext } from "@/lib/agents/automation-assistant-editors";
import { UPDATE_AUTOMATION_SETUP_TOOL_NAME } from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { createUpdateAutomationSetupTool } from "./tools/update-automation-setup";

/**
 * What the tools read and write across the calls of one turn: the page as the turn knows it,
 * for the editor the turn was sent from. The tool rewrites it, so after the turn it holds the
 * page as the turn left it.
 */
export type AutomationAssistantToolContext = {
  kind: "automation-editor";
  automationEditor: WorkspaceAutomationEditorContext;
};

export function createAutomationAssistantToolContext(
  page: AutomationAssistantPageContext,
): AutomationAssistantToolContext {
  switch (page.kind) {
    case "automation-editor":
      return { kind: page.kind, automationEditor: page };
    default:
      return assertNever(page.kind);
  }
}

/** The page as the turn left it. */
export function automationAssistantPageOf(
  toolContext: AutomationAssistantToolContext,
): AutomationAssistantPageContext {
  switch (toolContext.kind) {
    case "automation-editor":
      return toolContext.automationEditor;
    default:
      return assertNever(toolContext.kind);
  }
}

/** The one tool the editor's page is changed with. */
export function createAutomationAssistantTools(
  toolContext: AutomationAssistantToolContext,
): Record<string, Tool> {
  switch (toolContext.kind) {
    case "automation-editor":
      return {
        [UPDATE_AUTOMATION_SETUP_TOOL_NAME]: createUpdateAutomationSetupTool(toolContext),
      };
    default:
      return assertNever(toolContext.kind);
  }
}

/** The skill, in this agent's package, that says how to work in the editor. */
export function automationAssistantSkillFor(kind: AutomationAssistantToolContext["kind"]): string {
  switch (kind) {
    case "automation-editor":
      return "automation-setup";
    default:
      return assertNever(kind);
  }
}
