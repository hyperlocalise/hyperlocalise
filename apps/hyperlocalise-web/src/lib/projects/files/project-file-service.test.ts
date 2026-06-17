import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { filterProjectFiles } from "./project-file-service";

const baseFile: ProjectFileRecord = {
  origin: "provider",
  sourcePath: "keys/home.title",
  sourceHash: null,
  commitSha: null,
  workflowRunId: null,
  uploadedAt: "2026-01-01T00:00:00.000Z",
  storedFileId: null,
  metadata: {},
  filename: "home.title",
  byteSize: null,
  provider: {
    kind: "phrase",
    resourceType: "key",
    externalProjectId: "ext-1",
    externalResourceId: "key-1",
    externalUrl: null,
    syncState: "pending",
    sourceLocale: "en",
    targetLocales: ["fr"],
    localeReadiness: { fr: "missing" },
    revision: "1",
    format: "icu",
    lastSyncedAt: "2026-01-02T00:00:00.000Z",
  },
  latestJob: null,
};

describe("filterProjectFiles", () => {
  it("filters by origin, resource type, provider, locale, and sync state", () => {
    const files: ProjectFileRecord[] = [
      baseFile,
      {
        ...baseFile,
        origin: "repository",
        sourcePath: "src/en.json",
        filename: "en.json",
        provider: null,
      },
      {
        ...baseFile,
        sourcePath: "locales/home.json",
        filename: "home.json",
        provider: {
          ...baseFile.provider!,
          resourceType: "file",
          syncState: "synced",
          targetLocales: ["de"],
        },
      },
    ];

    expect(
      filterProjectFiles(files, {
        origin: "provider",
        resourceType: "key",
        providerKind: "phrase",
        locale: "fr",
        syncState: "pending",
        search: "home.title",
      }),
    ).toEqual([baseFile]);
  });
});
