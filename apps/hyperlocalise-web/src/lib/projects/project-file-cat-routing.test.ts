import { describe, expect, it } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

import { buildProjectFileCatHref, canOpenProjectFileCat } from "./project-file-cat-routing";

describe("canOpenProjectFileCat", () => {
  it("allows provider files supported by the live CAT workspace", () => {
    expect(
      canOpenProjectFileCat(
        createProjectFileRecord({
          origin: "provider",
          storedFileId: null,
          provider: {
            kind: "crowdin",
            resourceType: "file",
            externalProjectId: "project_website",
            externalResourceId: "file_home_json",
            externalUrl: null,
            syncState: "synced",
            sourceLocale: "en",
            targetLocales: ["fr-FR"],
            localeReadiness: {},
            revision: "1",
            format: "json",
            lastSyncedAt: new Date().toISOString(),
          },
        }),
      ),
    ).toBe(true);
  });

  it("allows native files with a stored file id", () => {
    expect(canOpenProjectFileCat(createProjectFileRecord())).toBe(true);
  });

  it("rejects native files without a stored file id", () => {
    expect(
      canOpenProjectFileCat(
        createProjectFileRecord({
          storedFileId: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("buildProjectFileCatHref", () => {
  it("builds provider CAT hrefs with locale and source path", () => {
    const file = createProjectFileRecord({
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
        targetLocales: ["fr-FR", "de-DE"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: new Date().toISOString(),
      },
    });

    expect(buildProjectFileCatHref("acme", "crowdin:project_website", file, "de-DE")).toBe(
      "/org/acme/projects/crowdin%3Aproject_website/files/cat?sourcePath=crowdin%2Fhome.json&locale=de-DE",
    );
  });

  it("builds native CAT hrefs with source path and optional locale", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(buildProjectFileCatHref("acme", "project_website", file, "fr-FR")).toBe(
      "/org/acme/projects/project_website/files/cat?sourcePath=marketing%2Fhome.json&locale=fr-FR",
    );
  });
});
