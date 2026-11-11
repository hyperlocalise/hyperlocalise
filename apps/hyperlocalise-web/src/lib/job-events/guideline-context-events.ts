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

import type { JobEventInput } from "./job-events-contract";

/** Counts, codes, and included guideline titles from one retrieval. No passage text. */
export type GuidelineRetrievalTrace = {
  localeCount: number;
  result: "ok" | "timeout" | "failed";
  errorCode: string | null;
  mandatoryIncludedCount: number;
  mandatoryOmittedCount: number;
  passageCount: number;
  passageDocumentCount: number;
  searchAvailable: boolean;
  /** Titles of guidelines included in the prompt, in prompt order. */
  includedTitles: string[];
};

/**
 * Five activity rows for one file-translation context load. Later steps are
 * skipped when guidelines are off or retrieval does not succeed.
 */
export function guidelineContextEvents(input: {
  enabled: boolean;
  trace: GuidelineRetrievalTrace | null;
}): JobEventInput[] {
  const trace = input.enabled ? input.trace : null;
  const recorded = trace?.result === "ok" ? trace : null;
  return [
    {
      type: "guideline_context",
      payload: { step: "flag", enabled: input.enabled },
    },
    {
      type: "guideline_context",
      payload: {
        step: "retrieve",
        status: trace ? "called" : "skipped",
        localeCount: trace?.localeCount ?? 0,
      },
    },
    {
      type: "guideline_context",
      payload: {
        step: "result",
        status: trace?.result ?? "skipped",
        code: trace?.errorCode ?? null,
        titles: trace?.result === "ok" ? trace.includedTitles : [],
      },
    },
    {
      type: "guideline_context",
      payload: recorded
        ? {
            step: "mandatory",
            status: "recorded",
            includedCount: recorded.mandatoryIncludedCount,
            omittedCount: recorded.mandatoryOmittedCount,
          }
        : { step: "mandatory", status: "skipped", includedCount: 0, omittedCount: 0 },
    },
    {
      type: "guideline_context",
      payload: recorded
        ? {
            step: "passages",
            status: "recorded",
            passageCount: recorded.passageCount,
            documentCount: recorded.passageDocumentCount,
            searchAvailable: recorded.searchAvailable,
          }
        : {
            step: "passages",
            status: "skipped",
            passageCount: 0,
            documentCount: 0,
            searchAvailable: false,
          },
    },
  ];
}
