import { getWorkflowMetadata } from "workflow";

import { env } from "@/lib/env";

export function getInternalApiUrl(path: string): string {
  const { url } = getWorkflowMetadata();
  return `${url}/api/internal/workflow${path}`;
}

export function internalApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.WORKFLOW_INTERNAL_SECRET) {
    headers["x-internal-secret"] = env.WORKFLOW_INTERNAL_SECRET;
  }
  return headers;
}

export type ClaimedTranslationJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  inputPayload: unknown;
  workflowRunId: string;
};

export type ClaimTranslationJobResult =
  | {
      kind: "claimed";
      job: ClaimedTranslationJob;
    }
  | {
      kind: "skipped";
      job: {
        id: string;
        projectId: string;
        type: "string" | "file";
        status: string;
        inputPayload: unknown;
        outcomeKind: string | null;
        outcomePayload: unknown;
        lastError: string | null;
        workflowRunId: string | null;
        completedAt: string | null;
      };
    };
