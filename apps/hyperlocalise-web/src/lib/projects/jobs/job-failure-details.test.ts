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
import { describe, expect, it } from "vite-plus/test";

import {
  formatJobFailureMessage,
  formatJobFailureReason,
  hasJobFailureDetails,
  isAgentAssignedJob,
  readJobFailureDetails,
  shouldShowJobFailureDetails,
} from "./job-failure-details";

describe("readJobFailureDetails", () => {
  it("prefers lastError and reads leftover locales from the outcome", () => {
    expect(
      readJobFailureDetails({
        lastError: "translating the json file failed. This is usually temporary — try again.",
        outcomePayload: {
          code: "file_translation_failed",
          message: "ignored when lastError is present",
          failedLocales: ["ja-JP", "ko-KR"],
          followUpJobId: "job_followup",
        },
      }),
    ).toEqual({
      reason: "translating the json file failed. This is usually temporary — try again.",
      failedLocales: ["ja-JP", "ko-KR"],
      followUpJobId: "job_followup",
      code: "file_translation_failed",
    });
  });

  it("reads a partial-success outcome when lastError is empty", () => {
    expect(
      readJobFailureDetails({
        lastError: null,
        outcomePayload: {
          outputFiles: [{ locale: "de-DE" }],
          failedLocales: ["ja-JP"],
          followUpJobId: "job_retry",
        },
      }),
    ).toEqual({
      reason: null,
      failedLocales: ["ja-JP"],
      followUpJobId: "job_retry",
      code: null,
    });
  });

  it("ignores malformed payloads and trims leftover locale values", () => {
    expect(
      readJobFailureDetails({
        lastError: "   ",
        outcomePayload: ["not-an-object"],
      }),
    ).toEqual({
      reason: null,
      failedLocales: [],
      followUpJobId: null,
      code: null,
    });
    expect(
      readJobFailureDetails({
        lastError: "",
        outcomePayload: {
          message: "  leftover locales remain  ",
          failedLocales: ["", " ja-JP ", "ja-JP", 12, null],
          followUpJobId: "   ",
          code: " leftover_locales ",
        },
      }),
    ).toEqual({
      reason: "leftover locales remain",
      failedLocales: [" ja-JP ", "ja-JP"],
      followUpJobId: null,
      code: "leftover_locales",
    });
  });

  it("reads a leftover-locale reason from the outcome when lastError was cleared", () => {
    expect(
      readJobFailureDetails({
        lastError: null,
        outcomePayload: {
          outputFiles: [{ locale: "de-DE" }],
          failedLocales: ["ja-JP"],
          followUpJobId: "job_retry",
          message:
            "the translation environment disconnected mid-run. This is usually temporary — try again.",
          code: "sandbox_timeout",
        },
      }),
    ).toEqual({
      reason:
        "the translation environment disconnected mid-run. This is usually temporary — try again.",
      failedLocales: ["ja-JP"],
      followUpJobId: "job_retry",
      code: "sandbox_timeout",
    });
  });
});

describe("job failure display helpers", () => {
  it("capitalizes the stored reason for the UI", () => {
    expect(
      formatJobFailureReason(
        "translating the json file failed. This is usually temporary — try again.",
      ),
    ).toBe("Translating the json file failed. This is usually temporary — try again.");
  });

  it("appends leftover locales to the persisted failure message", () => {
    expect(formatJobFailureMessage("translating the json file failed.", ["ja-JP", "th-TH"])).toBe(
      "translating the json file failed. Failed locales: ja-JP, th-TH.",
    );
  });

  it("treats a follow-up job id as visible failure details", () => {
    expect(
      hasJobFailureDetails({
        reason: null,
        failedLocales: [],
        followUpJobId: "job_retry",
        code: null,
      }),
    ).toBe(true);
    expect(
      shouldShowJobFailureDetails(
        { assigneeType: "agent" },
        {
          reason: null,
          failedLocales: [],
          followUpJobId: "job_retry",
          code: null,
        },
      ),
    ).toBe(true);
  });

  it("treats leftover locales as visible failure details", () => {
    expect(
      hasJobFailureDetails({
        reason: null,
        failedLocales: ["ja-JP"],
        followUpJobId: null,
        code: null,
      }),
    ).toBe(true);
  });

  it("shows failure details only on agent-assigned jobs", () => {
    const details = {
      reason: "translating the json file failed.",
      failedLocales: ["ja-JP"],
      followUpJobId: null,
      code: "file_translation_failed",
    };

    expect(isAgentAssignedJob({ assigneeType: "agent" })).toBe(true);
    expect(shouldShowJobFailureDetails({ assigneeType: "agent" }, details)).toBe(true);
    expect(shouldShowJobFailureDetails({ assigneeType: "user" }, details)).toBe(false);
    expect(shouldShowJobFailureDetails({ assigneeType: null }, details)).toBe(false);
  });
});
