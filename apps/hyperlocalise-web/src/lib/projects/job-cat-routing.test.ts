import { describe, expect, it } from "vite-plus/test";

import { buildJobCatHref, canOpenJobCat } from "./job-cat-routing";

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

describe("buildJobCatHref", () => {
  it("builds provider CAT hrefs with locale and source path when available", () => {
    expect(buildJobCatHref("acme", "project-1", createJob())).toBe(
      "/org/acme/projects/project-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json",
    );
    expect(buildJobCatHref("acme", null, createJob())).toBe(
      "/org/acme/projects/ext%3Acrowdin%3Aproject-1/jobs/ext%3Acrowdin%3Aproject-1%3Ajob-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json",
    );
    expect(buildJobCatHref("acme", null, createJob({ id: "job_native" }))).toBeNull();
    expect(buildJobCatHref("acme", "project-1", createJob({ kind: "sync" }))).toBeNull();
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
      "/org/acme/projects/project-1/jobs/job_native/strings?storedFileId=file_home_json&targetLocale=fr-FR",
    );
  });
});
