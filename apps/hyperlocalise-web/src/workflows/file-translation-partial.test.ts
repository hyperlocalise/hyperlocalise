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
  FILE_TRANSLATION_AUTO_RETRY_LIMIT,
  buildFileTranslationFollowUpMetadata,
  parseFileTranslationAutoRetryAttempt,
  remainingFileTranslationLocales,
  shouldEnqueueFileTranslationFollowUp,
  uniqueFileTranslationLocales,
  isReusableFileTranslationFollowUpStatus,
} from "./file-translation-partial";

describe("file translation partial completion", () => {
  it("treats a missing retry counter as the original job", () => {
    expect(parseFileTranslationAutoRetryAttempt(undefined)).toBe(0);
    expect(parseFileTranslationAutoRetryAttempt({})).toBe(0);
    expect(parseFileTranslationAutoRetryAttempt({ autoRetryAttempt: "nope" })).toBe(0);
  });

  it("reads a positive retry counter from job metadata", () => {
    expect(parseFileTranslationAutoRetryAttempt({ autoRetryAttempt: "1" })).toBe(1);
  });

  it("enqueues one follow-up for leftover locales on the original job", () => {
    expect(
      shouldEnqueueFileTranslationFollowUp({
        failedLocales: ["ja-JP"],
        retryAttempt: 0,
      }),
    ).toBe(true);
    expect(FILE_TRANSLATION_AUTO_RETRY_LIMIT).toBe(1);
  });

  it("does not enqueue another follow-up from an automatic retry", () => {
    expect(
      shouldEnqueueFileTranslationFollowUp({
        failedLocales: ["ja-JP"],
        retryAttempt: 1,
      }),
    ).toBe(false);
  });

  it("does not enqueue when every locale finished", () => {
    expect(
      shouldEnqueueFileTranslationFollowUp({
        failedLocales: [],
        retryAttempt: 0,
      }),
    ).toBe(false);
  });

  it("keeps unfinished locales after a partial store", () => {
    expect(
      remainingFileTranslationLocales({
        targetLocales: ["da-DK", "de-DE", "ja-JP"],
        completedLocales: ["de-DE"],
      }),
    ).toEqual(["da-DK", "ja-JP"]);
  });

  it("dedupes locale failures from assembly and store", () => {
    expect(uniqueFileTranslationLocales(["ja-JP", "de-DE", "ja-JP"])).toEqual(["ja-JP", "de-DE"]);
  });

  it("reuses an in-flight or finished follow-up instead of creating another", () => {
    expect(isReusableFileTranslationFollowUpStatus("queued")).toBe(true);
    expect(isReusableFileTranslationFollowUpStatus("running")).toBe(true);
    expect(isReusableFileTranslationFollowUpStatus("succeeded")).toBe(true);
    expect(isReusableFileTranslationFollowUpStatus("failed")).toBe(false);
    expect(isReusableFileTranslationFollowUpStatus("cancelled")).toBe(false);
  });

  it("records the parent job on the follow-up metadata", () => {
    expect(
      buildFileTranslationFollowUpMetadata(
        { title: "en-US.json · 2026-10-06 01:34", sourcePath: "lang/en-US.json" },
        { parentJobId: "job_parent", retryAttempt: 1 },
      ),
    ).toEqual({
      title: "en-US.json · 2026-10-06 01:34",
      sourcePath: "lang/en-US.json",
      autoRetryAttempt: "1",
      parentJobId: "job_parent",
    });
  });
});
