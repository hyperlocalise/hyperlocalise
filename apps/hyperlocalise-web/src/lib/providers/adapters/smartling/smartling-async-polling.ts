import type { SmartlingApiClient, SmartlingAsyncProcessStatus } from "./smartling-api";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_ATTEMPTS = 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalProcessState(status: SmartlingAsyncProcessStatus) {
  const state = `${status.processState ?? status.processStatus ?? ""}`.toLowerCase();
  if (!state) {
    return false;
  }
  return ["completed", "complete", "finished", "success", "succeeded", "failed", "cancelled"].some(
    (terminal) => state.includes(terminal),
  );
}

function isFailedProcessState(status: SmartlingAsyncProcessStatus) {
  const state = `${status.processState ?? status.processStatus ?? ""}`.toLowerCase();
  return state.includes("fail") || state.includes("cancel");
}

export async function pollSmartlingAsyncProcess(input: {
  client: SmartlingApiClient;
  projectId: string;
  processUid: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
}): Promise<SmartlingAsyncProcessStatus> {
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let lastStatus: SmartlingAsyncProcessStatus = { processUid: input.processUid };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    lastStatus = await input.client.getAsyncProcessStatus(input.projectId, input.processUid);
    if (isTerminalProcessState(lastStatus)) {
      if (isFailedProcessState(lastStatus)) {
        throw new Error(
          `smartling_async_process_failed:${lastStatus.processState ?? lastStatus.processStatus ?? "unknown"}`,
        );
      }
      return lastStatus;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error("smartling_async_process_timeout");
}

export async function pollSmartlingJobProgress(input: {
  client: SmartlingApiClient;
  projectId: string;
  translationJobUid: string;
  targetLocaleId?: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
}): Promise<Record<string, unknown>> {
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let lastProgress: Record<string, unknown> = {};
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const progress = await input.client.getJobProgress(
      input.projectId,
      input.translationJobUid,
      input.targetLocaleId,
    );
    lastProgress = progress as Record<string, unknown>;
    const percent =
      typeof progress.percentComplete === "number"
        ? progress.percentComplete
        : progress.totalWordCount && progress.completedWordCount
          ? (progress.completedWordCount / progress.totalWordCount) * 100
          : null;

    if (percent != null && percent >= 100) {
      return lastProgress;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error("smartling_job_progress_timeout");
}
