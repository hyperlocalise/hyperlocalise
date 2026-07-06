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
