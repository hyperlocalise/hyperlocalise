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

import { createPublicJobBodySchema, hashPublicJobRequest } from "./public-jobs.schema";

const stringJob = {
  type: "string" as const,
  projectId: "project_123",
  stringInput: {
    sourceText: "Hello world",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  },
};

function parsed(overrides: Record<string, unknown> = {}) {
  const result = createPublicJobBodySchema.safeParse({ ...stringJob, ...overrides });
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error("expected a valid public job body");
  }
  return result.data;
}

describe("hashPublicJobRequest", () => {
  it("treats owner email case as the same request", () => {
    expect(hashPublicJobRequest(parsed({ ownerEmail: "pm@example.com" }))).toBe(
      hashPublicJobRequest(parsed({ ownerEmail: "PM@example.com" })),
    );
  });

  it("treats dueAt values that name the same instant as the same request", () => {
    expect(hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00Z" }))).toBe(
      hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00.000Z" })),
    );
    expect(hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00Z" }))).toBe(
      hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00+00:00" })),
    );
    expect(hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00Z" }))).not.toBe(
      hashPublicJobRequest(parsed({ dueAt: "2026-11-15T17:00:00+10:00" })),
    );
  });

  it("treats metadata that differs only in key order as the same request", () => {
    const left = parsed({
      stringInput: {
        ...stringJob.stringInput,
        metadata: { instructions: "Keep names", tone: "formal" },
      },
    });
    const right = parsed({
      stringInput: {
        ...stringJob.stringInput,
        metadata: { tone: "formal", instructions: "Keep names" },
      },
    });
    expect(hashPublicJobRequest(left)).toBe(hashPublicJobRequest(right));
  });

  it("treats a blank description as omitted", () => {
    expect(hashPublicJobRequest(parsed({ description: "" }))).toBe(hashPublicJobRequest(parsed()));
  });
});

describe("hashPublicJobRequest file jobs", () => {
  const fileJob = {
    type: "file" as const,
    projectId: "project_123",
    fileInput: {
      sourceFileId: "file_123",
      fileFormat: "xliff" as const,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    },
  };

  function parsedFile(overrides: Record<string, unknown> = {}) {
    const result = createPublicJobBodySchema.safeParse({ ...fileJob, ...overrides });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("expected a valid public file job body");
    }
    return result.data;
  }

  it("treats owner email case and matching dueAt instants as the same file request", () => {
    expect(
      hashPublicJobRequest(
        parsedFile({ ownerEmail: "pm@example.com", dueAt: "2026-11-15T17:00:00Z" }),
      ),
    ).toBe(
      hashPublicJobRequest(
        parsedFile({ ownerEmail: "PM@example.com", dueAt: "2026-11-15T17:00:00.000Z" }),
      ),
    );
  });

  it("treats file metadata that differs only in key order as the same request", () => {
    const left = parsedFile({
      fileInput: {
        ...fileJob.fileInput,
        metadata: { instructions: "Keep names", tone: "formal" },
      },
    });
    const right = parsedFile({
      fileInput: {
        ...fileJob.fileInput,
        metadata: { tone: "formal", instructions: "Keep names" },
      },
    });
    expect(hashPublicJobRequest(left)).toBe(hashPublicJobRequest(right));
  });
});
