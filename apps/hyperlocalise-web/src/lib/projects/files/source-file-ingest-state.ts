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
export const sourceFileIngestStates = [
  "pending",
  "ingesting",
  "ingested",
  "skipped",
  "failed",
] as const;

export type SourceFileIngestState = (typeof sourceFileIngestStates)[number];

export const sourceFileIngestPollIntervalMs = 2_000;

export function isSourceFileIngestInProgress(state: SourceFileIngestState | null | undefined) {
  return state === "pending" || state === "ingesting";
}

export function isSourceFileIngestFailed(state: SourceFileIngestState | null | undefined) {
  return state === "failed";
}
