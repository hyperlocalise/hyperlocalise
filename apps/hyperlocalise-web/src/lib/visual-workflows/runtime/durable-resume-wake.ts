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
import { isMergeWakePending, type MergeResumeState } from "./merge-timeout";
import { isWaitWakePending, type WaitResumeState } from "./wait-schedule";

/**
 * Decide whether a durable run should sleep for Wait/Merge wakes or execute now.
 *
 * Any due (expired) resume must execute immediately — even if another resume is
 * still pending — otherwise a longer Merge timeout can block an already-due Wait
 * (and vice versa), then force Merge to time out before Wait can feed it.
 */
export function resolveDurableWaitMergeWake(input: {
  waitResume: WaitResumeState | null;
  mergeResume: MergeResumeState | null;
  nowMs?: number;
}): { action: "execute" } | { action: "sleep"; wakeAt: string } {
  const nowMs = input.nowMs ?? Date.now();
  const waitPending = isWaitWakePending(input.waitResume, nowMs);
  const mergePending = isMergeWakePending(input.mergeResume, nowMs);
  const waitDue = Boolean(input.waitResume) && !waitPending;
  const mergeDue = Boolean(input.mergeResume) && !mergePending;

  if (waitDue || mergeDue) {
    return { action: "execute" };
  }

  const wakes: string[] = [];
  if (waitPending && input.waitResume) wakes.push(input.waitResume.wakeAt);
  if (mergePending && input.mergeResume) wakes.push(input.mergeResume.wakeAt);
  if (wakes.length === 0) {
    return { action: "execute" };
  }

  wakes.sort((left, right) => Date.parse(left) - Date.parse(right));
  return { action: "sleep", wakeAt: wakes[0]! };
}
