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
import type { VisualWorkflowNodeRunStatus } from "../visual-workflow-run-types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";

export function shouldReuseDurableExecution(
  status: VisualWorkflowNodeRunStatus,
  value: unknown,
): value is VisualWorkflowNodeExecutionResult {
  if (["succeeded", "handled_error"].includes(status)) return true;
  if (status !== "failed") return false;
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== false) return false;
  if (!("error" in value) || !value.error || typeof value.error !== "object") return false;
  return "terminal" in value.error && value.error.terminal === true;
}

export function shouldReuseTryCatchBodyFailure(
  status: VisualWorkflowNodeRunStatus,
  value: unknown,
): value is VisualWorkflowNodeExecutionResult {
  if (status !== "failed") return false;
  if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== false) return false;
  if (!("error" in value) || !value.error || typeof value.error !== "object") return false;
  const code = "code" in value.error ? value.error.code : null;
  return ![
    "yield_execution",
    "needs_attention",
    "cancelled",
    "retry_backoff",
    "wait_suspended",
    "merge_suspended",
  ].includes(typeof code === "string" ? code : "");
}
