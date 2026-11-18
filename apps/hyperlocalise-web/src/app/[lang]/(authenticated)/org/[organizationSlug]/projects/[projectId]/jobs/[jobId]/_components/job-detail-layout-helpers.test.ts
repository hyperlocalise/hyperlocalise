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
import { createIntl, createIntlCache } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { createNativeJobDetail } from "./job-detail.fixture";
import { jobDetailTaskLayoutFromRecord, shortJobTitle } from "./job-detail-layout-helpers";

const intl = createIntl({ locale: "en-US", messages: {} }, createIntlCache());

describe("jobDetailTaskLayoutFromRecord", () => {
  it("prefers metadata.title over sourceFileId for native job titles", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_abc123",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
        metadata: { title: "messages.json · 2026-07-31 22:11" },
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("messages.json · 2026-07-31 22:11");
  });

  it("falls back to the original filename when metadata.title is missing", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      },
      sourceFilename: "messages.json",
      sourcePath: "marketing/messages.json",
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("marketing/messages.json");
    expect(layout.input.sourceFilesMetric).toBe("marketing/messages.json");
  });

  it("does not use a stored file id as the attached filename", () => {
    const job = createNativeJobDetail({
      inputPayload: {
        sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        fileFormat: "json",
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.title).toBe("file");
    expect(layout.input.sourceFilesMetric).toBe("file");
  });

  it("keeps a React assignee summary instead of joining every name", () => {
    const job = createNativeJobDetail({
      externalAssignedUsers: ["Ada", "Beau", "Cora", "Drew", "Eden"],
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);
    const assignees = layout.properties.find((property) => property.id === "assignees");

    expect(assignees?.value).not.toBe("Ada, Beau, Cora, Drew, Eden");
    expect(assignees?.value).not.toBeNull();
    expect(typeof assignees?.value).toBe("object");
  });

  it("leaves the failure reason to the notice and keeps the retry job id", () => {
    const job = createNativeJobDetail({
      assigneeType: "agent",
      ownerUserId: null,
      status: "failed",
      lastError: "translating the json file failed. This is usually temporary — try again.",
      outcomePayload: {
        code: "file_translation_failed",
        message: "translating the json file failed. This is usually temporary — try again.",
        failedLocales: ["ja-JP", "ko-KR"],
        followUpJobId: "job_retry",
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.properties.find((property) => property.id === "failure-reason")).toBeUndefined();
    expect(layout.properties.find((property) => property.id === "failed-locales")).toBeUndefined();
    expect(layout.secondaryProperties.find((property) => property.id === "follow-up-job")).toEqual({
      id: "follow-up-job",
      label: "Retry job",
      value: "job_retry",
    });
  });

  it("keeps the retry job id on a succeeded agent job with leftover locales", () => {
    const job = createNativeJobDetail({
      assigneeType: "agent",
      ownerUserId: null,
      status: "succeeded",
      lastError: null,
      outcomePayload: {
        outputFiles: [{ fileId: "file_de", locale: "de-DE", filename: "messages.de.json" }],
        failedLocales: ["ja-JP"],
        followUpJobId: "job_retry",
        message:
          "the translation environment disconnected mid-run. This is usually temporary — try again.",
        code: "sandbox_timeout",
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.properties.find((property) => property.id === "failure-reason")).toBeUndefined();
    expect(layout.properties.find((property) => property.id === "failed-locales")).toBeUndefined();
    expect(layout.secondaryProperties.find((property) => property.id === "follow-up-job")).toEqual({
      id: "follow-up-job",
      label: "Retry job",
      value: "job_retry",
    });
  });

  it("hides agent failure details on human-assigned jobs", () => {
    const job = createNativeJobDetail({
      assigneeType: "user",
      ownerUserId: "user_001",
      status: "failed",
      lastError: "Marked failed by user",
      outcomePayload: {
        code: "manual_failure",
        message: "Marked failed by user",
        failedLocales: ["ja-JP"],
      },
    });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.properties.find((property) => property.id === "failure-reason")).toBeUndefined();
    expect(layout.properties.find((property) => property.id === "failed-locales")).toBeUndefined();
  });

  it("drops the Progress row when it would only repeat the status", () => {
    const job = createNativeJobDetail({ status: "failed", externalStatus: null });

    const layout = jobDetailTaskLayoutFromRecord(job, intl);

    expect(layout.properties.map((property) => property.label)).not.toContain("Progress");
    expect(layout.properties.find((property) => property.label === "Task type")?.value).toBe(
      "Translation",
    );
  });

  it("lists only facts the Properties card does not repeat under the title", () => {
    const layout = jobDetailTaskLayoutFromRecord(createNativeJobDetail(), intl);

    expect(layout.metrics).toHaveLength(2);
    expect(layout.metrics[1]?.label).toMatch(/^Updated /);
  });
});

describe("shortJobTitle", () => {
  it("keeps the file name without its folder or creation timestamp", () => {
    expect(shortJobTitle("_posts/en/what-the-eu-ai-act.md · 2026-11-03 21:43")).toBe(
      "what-the-eu-ai-act.md",
    );
    expect(shortJobTitle("Homepage copy")).toBe("Homepage copy");
  });
});
