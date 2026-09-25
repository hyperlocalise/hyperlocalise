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
export type WaitResumeState = {
  waitNodeId: string;
  mode: "duration" | "timestamp" | "condition";
  scheduledAt: string;
  wakeAt: string;
  timeoutAt?: string;
};

export type WaitScheduleResult =
  | {
      status: "completed";
      scheduledAt: string;
      resumedAt: string;
    }
  | {
      status: "waiting";
      resume: WaitResumeState;
    }
  | {
      status: "timed_out";
      scheduledAt: string;
      resumedAt: string;
    }
  | {
      status: "invalid";
      error: {
        code: "invalid_wait";
        message: string;
      };
    };

export function parseWaitResumeState(value: unknown): WaitResumeState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.waitNodeId !== "string" ||
    (record.mode !== "duration" && record.mode !== "timestamp" && record.mode !== "condition") ||
    typeof record.scheduledAt !== "string" ||
    typeof record.wakeAt !== "string"
  ) {
    return null;
  }

  if (
    !Number.isFinite(Date.parse(record.scheduledAt)) ||
    !Number.isFinite(Date.parse(record.wakeAt))
  ) {
    return null;
  }

  const timeoutAt =
    typeof record.timeoutAt === "string" && Number.isFinite(Date.parse(record.timeoutAt))
      ? record.timeoutAt
      : undefined;

  return {
    waitNodeId: record.waitNodeId,
    mode: record.mode,
    scheduledAt: record.scheduledAt,
    wakeAt: record.wakeAt,
    timeoutAt,
  };
}

export function isWaitWakePending(
  resume: WaitResumeState | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!resume) {
    return false;
  }

  const wakeMs = Date.parse(resume.wakeAt);
  return Number.isFinite(wakeMs) && nowMs < wakeMs;
}

export function resolveWaitSchedule(input: {
  waitNodeId: string;
  mode: "duration" | "timestamp" | "condition";
  durationMs?: number;
  timestamp?: string;
  condition?: unknown;
  pollingIntervalMs?: number;
  timeoutMs?: number;
  previous?: WaitResumeState | null;
  nowMs?: number;
}): WaitScheduleResult {
  const nowMs = input.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();

  if (input.previous) {
    if (input.previous.waitNodeId !== input.waitNodeId) {
      return {
        status: "invalid",
        error: {
          code: "invalid_wait",
          message: "Wait resume state belongs to another node.",
        },
      };
    }

    if (input.previous.timeoutAt && nowMs >= Date.parse(input.previous.timeoutAt)) {
      return {
        status: "timed_out",
        scheduledAt: input.previous.scheduledAt,
        resumedAt: now,
      };
    }

    if (input.previous.mode !== "condition") {
      if (nowMs < Date.parse(input.previous.wakeAt)) {
        return {
          status: "waiting",
          resume: input.previous,
        };
      }

      return {
        status: "completed",
        scheduledAt: input.previous.scheduledAt,
        resumedAt: now,
      };
    }
  }

  if (input.mode === "duration") {
    if (
      input.durationMs === undefined ||
      !Number.isInteger(input.durationMs) ||
      input.durationMs < 0
    ) {
      return invalidWait("Wait duration must be a non-negative integer.");
    }

    if (input.durationMs === 0) {
      return {
        status: "completed",
        scheduledAt: now,
        resumedAt: now,
      };
    }

    return {
      status: "waiting",
      resume: {
        waitNodeId: input.waitNodeId,
        mode: "duration",
        scheduledAt: now,
        wakeAt: new Date(nowMs + input.durationMs).toISOString(),
      },
    };
  }

  if (input.mode === "timestamp") {
    const wakeMs = input.timestamp ? Date.parse(input.timestamp) : Number.NaN;

    if (!Number.isFinite(wakeMs)) {
      return invalidWait("Wait timestamp must be a valid ISO timestamp.");
    }

    // A timestamp in the past completes immediately.
    if (wakeMs <= nowMs) {
      return {
        status: "completed",
        scheduledAt: now,
        resumedAt: now,
      };
    }

    return {
      status: "waiting",
      resume: {
        waitNodeId: input.waitNodeId,
        mode: "timestamp",
        scheduledAt: now,
        wakeAt: new Date(wakeMs).toISOString(),
      },
    };
  }

  if (input.condition === true) {
    return {
      status: "completed",
      scheduledAt: input.previous?.scheduledAt ?? now,
      resumedAt: now,
    };
  }

  const pollingIntervalMs = input.pollingIntervalMs;
  const timeoutMs = input.timeoutMs;

  if (
    pollingIntervalMs === undefined ||
    !Number.isInteger(pollingIntervalMs) ||
    pollingIntervalMs < 1_000
  ) {
    return invalidWait("Wait polling interval must be at least 1000 milliseconds.");
  }

  if (timeoutMs === undefined || !Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    return invalidWait("Wait timeout must be at least 1000 milliseconds.");
  }

  const scheduledAt = input.previous?.scheduledAt ?? now;
  const timeoutAt =
    input.previous?.timeoutAt ?? new Date(Date.parse(scheduledAt) + timeoutMs).toISOString();

  if (nowMs >= Date.parse(timeoutAt)) {
    return {
      status: "timed_out",
      scheduledAt,
      resumedAt: now,
    };
  }

  return {
    status: "waiting",
    resume: {
      waitNodeId: input.waitNodeId,
      mode: "condition",
      scheduledAt,
      wakeAt: new Date(Math.min(nowMs + pollingIntervalMs, Date.parse(timeoutAt))).toISOString(),
      timeoutAt,
    },
  };
}

function invalidWait(message: string): WaitScheduleResult {
  return {
    status: "invalid",
    error: {
      code: "invalid_wait",
      message,
    },
  };
}
