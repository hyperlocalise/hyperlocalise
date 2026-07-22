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
/** Known provider job agent action ids (workflow-safe; no provider adapter imports). */
export type JobProviderActionId =
  | "translate_with_agent"
  | "review_with_agent"
  | "run_qa_checks"
  | "fix_qa_issues"
  | "leave_provider_comment"
  | "push_approved_changes";

const jobProviderActionIds = new Set<JobProviderActionId>([
  "translate_with_agent",
  "review_with_agent",
  "run_qa_checks",
  "fix_qa_issues",
  "leave_provider_comment",
  "push_approved_changes",
]);

export function isJobProviderActionId(value: string): value is JobProviderActionId {
  return jobProviderActionIds.has(value as JobProviderActionId);
}
