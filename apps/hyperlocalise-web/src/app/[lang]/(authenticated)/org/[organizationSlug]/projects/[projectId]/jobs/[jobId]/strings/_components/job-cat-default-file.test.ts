import { describe, expect, it } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

import { resolveDefaultJobCatFileReference } from "./job-cat-default-file";

const nativeFile = createProjectFileRecord({
  sourcePath: "en-US.json",
  storedFileId: "en-US.json",
  filename: "en-US.json",
});

const providerFile = createProjectFileRecord({
  origin: "provider",
  sourcePath: "crowdin/home.json",
  storedFileId: null,
  provider: {
    kind: "crowdin",
    resourceType: "file",
    externalProjectId: "project_website",
    externalResourceId: "file_home_json",
    externalUrl: null,
    syncState: "synced",
    sourceLocale: "en",
    targetLocales: ["vi", "de-DE"],
    localeReadiness: {},
    revision: "1",
    format: "json",
    lastSyncedAt: new Date().toISOString(),
  },
});

describe("resolveDefaultJobCatFileReference", () => {
  it("selects the first openable native file", () => {
    expect(resolveDefaultJobCatFileReference([nativeFile], "vi")).toEqual({
      sourcePath: null,
      storedFileId: "en-US.json",
      targetLocale: "vi",
    });
  });

  it("selects the first openable provider file by path", () => {
    expect(resolveDefaultJobCatFileReference([providerFile], "vi")).toEqual({
      sourcePath: "crowdin/home.json",
      storedFileId: null,
      targetLocale: "vi",
    });
  });

  it("returns null when no target locale is available", () => {
    expect(resolveDefaultJobCatFileReference([nativeFile], null)).toBeNull();
  });
});
