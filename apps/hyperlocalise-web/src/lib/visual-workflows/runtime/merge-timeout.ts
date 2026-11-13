/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */

export type MergeResumeState = {
  mergeNodeId: string;
  iteration: number;
  scheduledAt: string;
  wakeAt: string;
};

export function parseMergeResumeState(value: unknown): MergeResumeState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.mergeNodeId !== "string" ||
    typeof record.scheduledAt !== "string" ||
    typeof record.wakeAt !== "string" ||
    !Number.isFinite(Date.parse(record.scheduledAt)) ||
    !Number.isFinite(Date.parse(record.wakeAt))
  )
    return null;

  return {
    mergeNodeId: record.mergeNodeId,
    iteration:
      typeof record.iteration === "number" && Number.isInteger(record.iteration)
        ? record.iteration
        : -1,
    scheduledAt: record.scheduledAt,
    wakeAt: record.wakeAt,
  };
}

export function isMergeWakePending(
  resume: MergeResumeState | null | undefined,
  nowMs = Date.now(),
): boolean {
  return Boolean(resume && nowMs < Date.parse(resume.wakeAt));
}

export function resolveMergeTimeout(input: {
  mergeNodeId: string;
  iteration?: number;
  timeoutMs: number;
  previous?: MergeResumeState | null;
  nowMs?: number;
}): { status: "waiting"; resume: MergeResumeState } | { status: "timed_out" } {
  const iteration = input.iteration ?? -1;
  const nowMs = input.nowMs ?? Date.now();
  const previous = input.previous;

  if (previous?.mergeNodeId === input.mergeNodeId && previous.iteration === iteration) {
    return nowMs >= Date.parse(previous.wakeAt)
      ? { status: "timed_out" }
      : { status: "waiting", resume: previous };
  }

  const scheduledAt = new Date(nowMs).toISOString();
  return {
    status: "waiting",
    resume: {
      mergeNodeId: input.mergeNodeId,
      iteration,
      scheduledAt,
      wakeAt: new Date(nowMs + input.timeoutMs).toISOString(),
    },
  };
}
