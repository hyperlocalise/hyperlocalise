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
  buildJobContentEditorHref,
  canOpenJobContentEditor,
  parseJobContentEditorQueueFilterParam,
  resolveDefaultJobContentEditorQueueFilter,
} from "./job-content-editor-routing";

function createJob(
  overrides: Partial<Parameters<typeof canOpenJobContentEditor>[0]> = {},
): Parameters<typeof canOpenJobContentEditor>[0] {
  return {
    id: "ext:crowdin:project-1:job-1",
    kind: "translation",
    type: "file",
    externalProviderKind: "crowdin",
    externalTargetLocales: ["fr-FR"],
    reviewTargetLocale: null,
    inputPayload: { sourceFileId: "locales/en.json" },
    ...overrides,
  };
}

describe("canOpenJobContentEditor", () => {
  it("allows provider-backed translation and review jobs", () => {
    expect(canOpenJobContentEditor(createJob())).toBe(true);
    expect(canOpenJobContentEditor(createJob({ kind: "review" }))).toBe(true);
    expect(canOpenJobContentEditor(createJob({ kind: "proofread" }))).toBe(true);
    expect(canOpenJobContentEditor(createJob({ kind: "sync" }))).toBe(false);
  });

  it("allows native file translation jobs with a source file id", () => {
    expect(
      canOpenJobContentEditor(
        createJob({
          externalProviderKind: null,
          externalTargetLocales: null,
          id: "job_native",
          kind: "translation",
          type: "file",
          inputPayload: {
            sourceFileId: "file_home_json",
            targetLocales: ["fr-FR"],
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects native jobs without a source file id", () => {
    expect(
      canOpenJobContentEditor(
        createJob({
          externalProviderKind: null,
          externalTargetLocales: null,
          id: "job_native",
          kind: "translation",
          type: "file",
          inputPayload: { targetLocales: ["fr-FR"] },
        }),
      ),
    ).toBe(false);
  });
});

describe("resolveDefaultJobContentEditorQueueFilter", () => {
  it("defaults review jobs and waiting-for-review tasks to needs_review", () => {
    expect(resolveDefaultJobContentEditorQueueFilter({ kind: "review" })).toBe("needs_review");
    expect(resolveDefaultJobContentEditorQueueFilter({ kind: "proofread" })).toBe("needs_review");
    expect(
      resolveDefaultJobContentEditorQueueFilter({
        kind: "translation",
        status: "waiting_for_review",
      }),
    ).toBe("needs_review");
  });

  it("defaults translation jobs to untranslated", () => {
    expect(
      resolveDefaultJobContentEditorQueueFilter({ kind: "translation", status: "running" }),
    ).toBe("untranslated");
  });

  it("falls back to all for other job kinds", () => {
    expect(resolveDefaultJobContentEditorQueueFilter({ kind: "sync" })).toBe("all");
  });
});

describe("parseJobContentEditorQueueFilterParam", () => {
  it("accepts supported queue filters and rejects unknown values", () => {
    expect(parseJobContentEditorQueueFilterParam("needs_review")).toBe("needs_review");
    expect(parseJobContentEditorQueueFilterParam("invalid")).toBeUndefined();
    expect(parseJobContentEditorQueueFilterParam(undefined)).toBeUndefined();
  });
});

describe("buildJobContentEditorHref", () => {
  it("builds provider CAT hrefs with locale and source path when available", () => {
    expect(buildJobContentEditorHref("acme", "project-1", createJob())).toBe(
      "/org/acme/projects/project-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json&queueFilter=untranslated",
    );
    expect(buildJobContentEditorHref("acme", null, createJob())).toBe(
      "/org/acme/projects/ext%3Acrowdin%3Aproject-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json&queueFilter=untranslated",
    );
    expect(buildJobContentEditorHref("acme", null, createJob({ id: "job_native" }))).toBeNull();
    expect(buildJobContentEditorHref("acme", "project-1", createJob({ kind: "sync" }))).toBeNull();
  });

  it("includes needs_review queue filter for review jobs", () => {
    expect(buildJobContentEditorHref("acme", "project-1", createJob({ kind: "review" }))).toContain(
      "queueFilter=needs_review",
    );
    expect(
      buildJobContentEditorHref("acme", "project-1", createJob({ status: "waiting_for_review" })),
    ).toContain("queueFilter=needs_review");
  });

  it("builds native CAT hrefs with stored file id and target locale", () => {
    expect(
      buildJobContentEditorHref(
        "acme",
        "project-1",
        createJob({
          externalProviderKind: null,
          externalTargetLocales: null,
          id: "job_native",
          inputPayload: {
            sourceFileId: "file_home_json",
            targetLocales: ["fr-FR", "de-DE"],
          },
        }),
      ),
    ).toBe(
      "/org/acme/projects/project-1/jobs/job_native/strings?storedFileId=file_home_json&targetLocale=fr-FR&queueFilter=untranslated",
    );
  });
});
