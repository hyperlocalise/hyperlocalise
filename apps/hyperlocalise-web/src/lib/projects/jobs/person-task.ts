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

import type { VisualTaskStep } from "@/lib/visual-workflows/schema/types";

/** Post-edit tasks are stored as proofread jobs with this step. */
export const POST_EDIT_WORKFLOW_TASK_STEP = "edit";

/**
 * The step of a task for people, or null for any other job. A proofread job is a post-edit task
 * when its stored step says so and a proofread task otherwise, which covers proofread tasks made
 * in the app and tasks made of chosen strings. A translation job is a translate task only when a
 * person was given it as one.
 */
export function personTaskStep(job: {
  kind: string;
  assigneeType?: string | null;
  workflowTaskStep: string | null;
}): VisualTaskStep | null {
  if (job.assigneeType === "agent") {
    return null;
  }
  if (job.kind === "proofread") {
    return job.workflowTaskStep === POST_EDIT_WORKFLOW_TASK_STEP ? "edit" : "proofread";
  }
  return job.kind === "translation" && job.workflowTaskStep === "translate" ? "translate" : null;
}

/** An open proofread or post-edit task waiting on a person. Translate tasks have no Mark done. */
export function isMarkableProofreadTask(job: {
  kind: string;
  status: string;
  assigneeType?: string | null;
}): boolean {
  return (
    job.kind === "proofread" && job.status === "waiting_for_review" && job.assigneeType !== "agent"
  );
}

/** A task that comes after another job and has not opened yet (`waiting-task.ts`). */
export function isWaitingTask(job: { status?: string; afterJobId?: string | null }): boolean {
  return Boolean(job.afterJobId) && job.status === "queued";
}
