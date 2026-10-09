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
import { z } from "zod";

import { visualWorkflowV3DefinitionSchema } from "@/lib/visual-workflows/schema/definition-schema";
import type { VisualWorkflowV3Definition } from "@/lib/visual-workflows/schema/types";

export const VISUAL_WORKFLOW_EDITOR_CONTEXT_KIND = "visual-workflow-editor";

const MAX_ID_CHARS = 255;
const MAX_NAME_CHARS = 500;
const MAX_WORKFLOW_NAME_CHARS = 120;

/**
 * What an open visual workflow editor tells the assistant with each turn: the workflow as the
 * canvas holds it at that moment. It describes the page at that moment and is never stored.
 */
export const visualWorkflowEditorContextSchema = z.object({
  kind: z.literal(VISUAL_WORKFLOW_EDITOR_CONTEXT_KIND),
  /** Names one mounted editor, so a change is applied only to the page it was made for. */
  editorSessionId: z.string().min(1).max(MAX_ID_CHARS),
  visualWorkflowId: z.string().min(1).max(MAX_ID_CHARS),
  // The name may be empty while the person is typing one; the saved definition forbids that.
  definition: visualWorkflowV3DefinitionSchema.extend({
    name: z.string().max(MAX_WORKFLOW_NAME_CHARS),
  }),
  /** Display name of the project the workflow is in, when the page knows it. */
  projectName: z.string().min(1).max(MAX_NAME_CHARS).nullable().optional(),
});

export type VisualWorkflowEditorContext = z.infer<typeof visualWorkflowEditorContextSchema>;

export function buildVisualWorkflowEditorContext(input: {
  editorSessionId: string;
  visualWorkflowId: string;
  definition: VisualWorkflowV3Definition;
  projectName?: string | null;
}): VisualWorkflowEditorContext {
  return {
    kind: VISUAL_WORKFLOW_EDITOR_CONTEXT_KIND,
    editorSessionId: input.editorSessionId,
    visualWorkflowId: input.visualWorkflowId,
    definition: input.definition,
    projectName: input.projectName?.trim() || null,
  };
}
