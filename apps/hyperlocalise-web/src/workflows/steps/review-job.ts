import type { ReviewJobEventData } from "@/lib/workflow/types";
import type { ClaimedReviewJob } from "@/lib/translation/review-job-queued-function";

export async function claimReviewJobStep(input: { event: ReviewJobEventData; runId: string }) {
  "use step";
  const { claimReviewJob } = await import("@/lib/translation/review-job-queued-function");
  return claimReviewJob(input);
}

export async function executeClaimedReviewJobStep(job: ClaimedReviewJob) {
  "use step";
  const { executeClaimedReviewJob } = await import("@/lib/translation/review-job-queued-function");
  return executeClaimedReviewJob(job);
}

export async function completeReviewJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  outcome: unknown;
  status: "succeeded" | "waiting_for_review";
}) {
  "use step";
  const { completeReviewJob } = await import("@/lib/translation/review-job-queued-function");
  return completeReviewJob(input);
}

export async function failReviewJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  "use step";
  const { failReviewJob } = await import("@/lib/translation/review-job-queued-function");
  return failReviewJob(input);
}
