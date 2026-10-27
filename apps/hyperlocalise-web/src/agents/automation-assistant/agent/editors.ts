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
import { EDIT_VISUAL_WORKFLOW_TOOL_NAME } from "@/lib/agents/visual-workflow-assistant";
import type { VisualWorkflowEditorContext } from "@/lib/agents/visual-workflow-editor-context";
import { UPDATE_AUTOMATION_SETUP_TOOL_NAME } from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { createEditVisualWorkflowTool } from "./tools/edit-visual-workflow";
import { createUpdateAutomationSetupTool } from "./tools/update-automation-setup";

/**
 * What the tools read and write across the calls of one turn: the page as the turn knows it,
 * for the editor the turn was sent from. The tool rewrites it, so after the turn it holds the
 * page as the turn left it.
 */
export type AutomationAssistantToolContext =
  | { kind: "automation-editor"; automationEditor: WorkspaceAutomationEditorContext }
  | { kind: "visual-workflow-editor"; visualWorkflowEditor: VisualWorkflowEditorContext };

export function createAutomationAssistantToolContext(
  page: AutomationAssistantPageContext,
): AutomationAssistantToolContext {
  switch (page.kind) {
    case "automation-editor":
      return { kind: page.kind, automationEditor: page };
    case "visual-workflow-editor":
      return { kind: page.kind, visualWorkflowEditor: page };
    default:
      return assertNever(page);
  }
}

/** The page as the turn left it. */
export function automationAssistantPageOf(
  toolContext: AutomationAssistantToolContext,
): AutomationAssistantPageContext {
  switch (toolContext.kind) {
    case "automation-editor":
      return toolContext.automationEditor;
    case "visual-workflow-editor":
      return toolContext.visualWorkflowEditor;
    default:
      return assertNever(toolContext);
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
    case "visual-workflow-editor":
      return {
        [EDIT_VISUAL_WORKFLOW_TOOL_NAME]: createEditVisualWorkflowTool(toolContext),
      };
    default:
      return assertNever(toolContext);
  }
}

/** The skill, in this agent's package, that says how to work in the editor. */
export function automationAssistantSkillFor(kind: AutomationAssistantToolContext["kind"]): string {
  switch (kind) {
    case "automation-editor":
      return "automation-setup";
    case "visual-workflow-editor":
      return "visual-workflow";
    default:
      return assertNever(kind);
  }
}
