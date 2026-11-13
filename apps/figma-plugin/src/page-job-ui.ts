import type { FigmaPageJob } from "./plugin-messages";
import type { StepProgress } from "./workflow-ui";

export function isInFlightJobStatus(status: FigmaPageJob["status"]) {
  return status === "queued" || status === "running";
}

export function jobStatusLabel(status: FigmaPageJob["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Translating";
    case "waiting_for_review":
      return "Needs review";
    case "succeeded":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

export function isTranslatingJobStatus(status: FigmaPageJob["status"]) {
  return status === "running";
}

export function jobPollingStepProgress(
  status: FigmaPageJob["status"],
  pulse: number,
): StepProgress | null {
  if (!isTranslatingJobStatus(status)) {
    return null;
  }
  return { label: "Translating…", value: 35 + (pulse % 45) };
}

export function pageJobFromCreate(input: {
  jobId: string;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
}): FigmaPageJob {
  return {
    jobId: input.jobId,
    status: "queued",
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocales: input.targetLocales,
    lastError: null,
    translationsByLocale: {},
  };
}
