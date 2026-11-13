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
import type { VisualWorkflowV3Definition } from "../schema/types";
import {
  compileVisualWorkflowV3Definition,
  toVisualWorkflowExecutionDefinition,
  type VisualWorkflowV3CompilationIssue,
} from "./compile-workflow-v3";
import { validateVisualWorkflowDefinition } from "./validate-workflow";

export type VisualWorkflowV3ValidationIssue =
  | VisualWorkflowV3CompilationIssue
  | ReturnType<typeof validateVisualWorkflowDefinition>[number];

export function validateVisualWorkflowV3Definition(
  definition: VisualWorkflowV3Definition,
): VisualWorkflowV3ValidationIssue[] {
  const compiled = compileVisualWorkflowV3Definition(definition);

  return [
    ...compiled.issues,
    ...validateVisualWorkflowDefinition(toVisualWorkflowExecutionDefinition(compiled)),
  ];
}
