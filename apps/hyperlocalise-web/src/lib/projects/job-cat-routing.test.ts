import { describe, expect, it } from "vite-plus/test";

import {
  buildJobCatHref,
  canOpenJobCat,
  parseJobCatQueueFilterParam,
  resolveDefaultJobCatQueueFilter,
} from "./job-cat-routing";

function createJob(
  overrides: Partial<Parameters<typeof canOpenJobCat>[0]> = {},
): Parameters<typeof canOpenJobCat>[0] {
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

describe("canOpenJobCat", () => {
  it("allows provider-backed translation and review jobs", () => {
    expect(canOpenJobCat(createJob())).toBe(true);
    expect(canOpenJobCat(createJob({ kind: "review" }))).toBe(true);
    expect(canOpenJobCat(createJob({ kind: "proofread" }))).toBe(true);
    expect(canOpenJobCat(createJob({ kind: "sync" }))).toBe(false);
  });

  it("allows native file translation jobs with a source file id", () => {
    expect(
      canOpenJobCat(
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
      canOpenJobCat(
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

describe("resolveDefaultJobCatQueueFilter", () => {
  it("defaults review jobs and waiting-for-review tasks to needs_review", () => {
    expect(resolveDefaultJobCatQueueFilter({ kind: "review" })).toBe("needs_review");
    expect(resolveDefaultJobCatQueueFilter({ kind: "proofread" })).toBe("needs_review");
    expect(
      resolveDefaultJobCatQueueFilter({ kind: "translation", status: "waiting_for_review" }),
    ).toBe("needs_review");
  });

  it("defaults translation jobs to untranslated", () => {
    expect(resolveDefaultJobCatQueueFilter({ kind: "translation", status: "running" })).toBe(
      "untranslated",
    );
  });

  it("falls back to all for other job kinds", () => {
    expect(resolveDefaultJobCatQueueFilter({ kind: "sync" })).toBe("all");
  });
});

describe("parseJobCatQueueFilterParam", () => {
  it("accepts supported queue filters and rejects unknown values", () => {
    expect(parseJobCatQueueFilterParam("needs_review")).toBe("needs_review");
    expect(parseJobCatQueueFilterParam("invalid")).toBeUndefined();
    expect(parseJobCatQueueFilterParam(undefined)).toBeUndefined();
  });
});

describe("buildJobCatHref", () => {
  it("builds provider CAT hrefs with locale and source path when available", () => {
    expect(buildJobCatHref("acme", "project-1", createJob())).toBe(
      "/org/acme/projects/project-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json&queueFilter=untranslated",
    );
    expect(buildJobCatHref("acme", null, createJob())).toBe(
      "/org/acme/projects/ext%3Acrowdin%3Aproject-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json&queueFilter=untranslated",
    );
    expect(buildJobCatHref("acme", null, createJob({ id: "job_native" }))).toBeNull();
    expect(buildJobCatHref("acme", "project-1", createJob({ kind: "sync" }))).toBeNull();
  });

  it("includes needs_review queue filter for review jobs", () => {
    expect(buildJobCatHref("acme", "project-1", createJob({ kind: "review" }))).toContain(
      "queueFilter=needs_review",
    );
    expect(
      buildJobCatHref("acme", "project-1", createJob({ status: "waiting_for_review" })),
    ).toContain("queueFilter=needs_review");
  });

  it("builds native CAT hrefs with stored file id and target locale", () => {
    expect(
      buildJobCatHref(
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
