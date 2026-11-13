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
  COMPACT_JOB_LAST_ERROR_MAX_LENGTH,
  publicJobOutputFiles,
  toPublicJobEnvelope,
  truncatePublicJobLastError,
} from "./public-jobs.read";

const validOutputFiles = [{ fileId: " f ", locale: "fr", filename: "a.xliff", url: "x" }];

describe("publicJobOutputFiles", () => {
  it("keeps valid file results and drops extra JSON keys", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: validOutputFiles },
      }),
    ).toEqual([{ fileId: " f ", locale: "fr", filename: "a.xliff" }]);
  });

  it("returns an empty list for an empty outputFiles array", () => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: [] },
      }),
    ).toEqual([]);
  });

  it.each([
    ["blank field", { outputFiles: [{ fileId: " \t", locale: "fr", filename: "a" }] }],
    ["non-string field", { outputFiles: [{ fileId: 1, locale: "fr", filename: "a" }] }],
    ["null field", { outputFiles: [{ fileId: null, locale: "fr", filename: "a" }] }],
    ["missing field", { outputFiles: [{ locale: "fr", filename: "a" }] }],
    [
      "one bad entry",
      {
        outputFiles: [{ fileId: "f", locale: "fr", filename: "a" }, { fileId: "" }],
      },
    ],
    ["array entry", { outputFiles: [["f"]] }],
    ["null entry", { outputFiles: [null] }],
    ["not an array", { outputFiles: { fileId: "f" } }],
    ["null list", { outputFiles: null }],
    ["missing list", {}],
  ])("returns null for malformed output (%s)", (_name, outcomePayload) => {
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload,
      }),
    ).toBeNull();
  });

  it("returns null for non-file jobs and non-object payloads", () => {
    expect(
      publicJobOutputFiles({
        type: "string",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: validOutputFiles },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "string_result",
        outcomePayload: { outputFiles: validOutputFiles },
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: null,
      }),
    ).toBeNull();
    expect(
      publicJobOutputFiles({
        type: "file",
        outcomeKind: "file_result",
        outcomePayload: [],
      }),
    ).toBeNull();
  });
});

describe("toPublicJobEnvelope", () => {
  it("exposes outputFiles as null when metadata is malformed", () => {
    const createdAt = new Date("2026-01-02T03:04:05.678Z");
    expect(
      toPublicJobEnvelope({
        id: "job_1",
        projectId: "project_1",
        kind: "translation",
        type: "file",
        status: "succeeded",
        outcomeKind: "file_result",
        outcomePayload: { outputFiles: [{ fileId: "", locale: "fr-FR", filename: "a" }] },
        lastError: null,
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
      }).outputFiles,
    ).toBeNull();
  });
});

describe("truncatePublicJobLastError", () => {
  it("keeps short errors and truncates compact list errors", () => {
    expect(truncatePublicJobLastError(null)).toBeNull();
    expect(truncatePublicJobLastError("short")).toBe("short");
    const longError = "x".repeat(COMPACT_JOB_LAST_ERROR_MAX_LENGTH + 10);
    expect(truncatePublicJobLastError(longError)).toBe(
      longError.slice(0, COMPACT_JOB_LAST_ERROR_MAX_LENGTH),
    );
  });
});
