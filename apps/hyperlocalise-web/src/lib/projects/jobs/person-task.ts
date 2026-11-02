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

/** Visual-workflow post-edit tasks are stored as proofread jobs with this step. */
export const POST_EDIT_WORKFLOW_TASK_STEP = "edit";

export function readWorkflowTaskStep(inputPayload: unknown): string | null {
  if (!inputPayload || typeof inputPayload !== "object" || Array.isArray(inputPayload)) {
    return null;
  }

  const metadata = (inputPayload as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const step = (metadata as Record<string, unknown>).workflowTaskStep;
  return typeof step === "string" && step.length > 0 ? step : null;
}

/**
 * An open proofread task waiting on a person. Visual-workflow post-edit and
 * translate tasks are excluded; those steps do not use Mark done yet.
 */
export function isMarkableProofreadTask(job: {
  kind: string;
  status: string;
  assigneeType?: string | null;
  inputPayload?: unknown;
}): boolean {
  return (
    job.kind === "proofread" &&
    job.status === "waiting_for_review" &&
    job.assigneeType !== "agent" &&
    readWorkflowTaskStep(job.inputPayload) !== POST_EDIT_WORKFLOW_TASK_STEP
  );
}
