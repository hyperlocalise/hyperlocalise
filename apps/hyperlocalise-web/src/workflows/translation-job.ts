import { fetch as workflowFetch, getWorkflowMetadata } from "workflow";

import { env } from "@/lib/env";
import type { TranslationJobQueuedEventData } from "@/lib/workflow/types";

function getInternalApiUrl(path: string): string {
  const { url } = getWorkflowMetadata();
  return `${url}/api/internal/workflow${path}`;
}

function internalApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (env.WORKFLOW_INTERNAL_SECRET) {
    headers["x-internal-secret"] = env.WORKFLOW_INTERNAL_SECRET;
  }
  return headers;
}

type ClaimTranslationJobInput = {
  event: TranslationJobQueuedEventData;
  runId: string;
};

type ClaimedTranslationJob = {
  id: string;
  projectId: string;
  type: "string" | "file";
  inputPayload: unknown;
  workflowRunId: string;
};

type ClaimTranslationJobResult =
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

type TranslationJobExecutionResult =
  | {
      ok: true;
      result: unknown;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

async function claimTranslationJobStep(input: ClaimTranslationJobInput) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/claim"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to claim translation job: ${response.status}`);
  }

  const data = (await response.json()) as { result: ClaimTranslationJobResult };
  return data.result;
}

async function executeClaimedTranslationJobStep(job: ClaimedTranslationJob) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/execute-string"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify({ job }),
  });

  if (!response.ok) {
    throw new Error(`failed to execute translation job: ${response.status}`);
  }

  const data = (await response.json()) as { result: TranslationJobExecutionResult };
  return data.result;
}

async function completeTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  result: unknown;
}) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/complete"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to complete translation job: ${response.status}`);
  }

  const data = (await response.json()) as {
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
  return data.job;
}

async function failTranslationJobStep(input: {
  jobId: string;
  projectId: string;
  workflowRunId: string;
  code: string;
  message: string;
}) {
  "use step";

  const response = await workflowFetch(getInternalApiUrl("/translation-jobs/fail"), {
    method: "POST",
    headers: internalApiHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`failed to fail translation job: ${response.status}`);
  }

  const data = (await response.json()) as {
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
  return data.job;
}

function formatExecutionError(error: unknown) {
  return error instanceof Error ? error.message : "translation job execution failed";
}

export async function translationJobWorkflow(event: TranslationJobQueuedEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const claim = await claimTranslationJobStep({
    event,
    runId: workflowRunId,
  });

  if (claim.kind === "skipped") {
    return claim.job;
  }

  try {
    const execution = await executeClaimedTranslationJobStep(claim.job);

    if (!execution.ok) {
      return failTranslationJobStep({
        jobId: claim.job.id,
        projectId: claim.job.projectId,
        workflowRunId: claim.job.workflowRunId,
        code: execution.code,
        message: execution.message,
      });
    }

    return completeTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      result: execution.result,
    });
  } catch (error) {
    return failTranslationJobStep({
      jobId: claim.job.id,
      projectId: claim.job.projectId,
      workflowRunId: claim.job.workflowRunId,
      code: "translation_execution_failed",
      message: formatExecutionError(error),
    });
  }
}
