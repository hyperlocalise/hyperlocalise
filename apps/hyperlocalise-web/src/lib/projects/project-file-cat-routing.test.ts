import { describe, expect, it } from "vite-plus/test";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

import {
  buildProjectFileCatHref,
  canOpenProjectFileCat,
  resolveProjectFileCatTargetLocale,
  resolveProjectFileCatTargetLocales,
} from "./project-file-cat-routing";

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
      "/org/acme/projects/crowdin%3Aproject_website/files/cat?sourcePath=crowdin%2Fhome.json&locale=de-DE&externalResourceId=file_home_json",
    );
  });

  it("includes resourceType for non-file provider resources", () => {
    const file = createProjectFileRecord({
      origin: "provider",
      sourcePath: "feature::welcome",
      storedFileId: null,
      provider: {
        kind: "phrase",
        resourceType: "key",
        externalProjectId: "project_website",
        externalResourceId: "key-welcome",
        externalUrl: null,
        syncState: "synced",
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        localeReadiness: {},
        revision: "1",
        format: "json",
        lastSyncedAt: new Date().toISOString(),
      },
    });

    expect(buildProjectFileCatHref("acme", "phrase:project_website", file, null)).toContain(
      "resourceType=key",
    );
    expect(buildProjectFileCatHref("acme", "phrase:project_website", file, null)).toContain(
      "externalResourceId=key-welcome",
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

  it("preserves the provider branch filter in CAT hrefs", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(buildProjectFileCatHref("acme", "project_website", file, "fr-FR", "main")).toBe(
      "/org/acme/projects/project_website/files/cat?sourcePath=marketing%2Fhome.json&locale=fr-FR&branch=main",
    );
  });

  it("falls back to the first native project target locale", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(
      buildProjectFileCatHref("acme", "project_website", file, null, null, ["vi", "fr-FR"]),
    ).toBe("/org/acme/projects/project_website/files/cat?sourcePath=marketing%2Fhome.json&locale=vi");
  });
});

describe("resolveProjectFileCatTargetLocale", () => {
  it("uses the requested native locale when it belongs to the project", () => {
    expect(resolveProjectFileCatTargetLocale(createProjectFileRecord(), "fr-FR", ["vi", "fr-FR"]))
      .toBe("fr-FR");
  });

  it("falls back to the first configured native project target locale", () => {
    expect(resolveProjectFileCatTargetLocale(createProjectFileRecord(), null, ["vi", "fr-FR"])).toBe(
      "vi",
    );
  });

  it("falls back from an unknown requested native locale to a project locale", () => {
    expect(resolveProjectFileCatTargetLocale(createProjectFileRecord(), "ja-JP", ["vi"])).toBe(
      "vi",
    );
  });

  it("returns null when native project locales are known to be empty", () => {
    expect(resolveProjectFileCatTargetLocale(createProjectFileRecord(), "vi", [])).toBe(null);
  });

  it("can infer native locales from file readiness when project data is not supplied", () => {
    expect(
      resolveProjectFileCatTargetLocale(
        createProjectFileRecord({ localeReadiness: { vi: "missing" } }),
        null,
      ),
    ).toBe("vi");
  });
});

describe("resolveProjectFileCatTargetLocales", () => {
  it("returns native project locales when supplied", () => {
    expect(resolveProjectFileCatTargetLocales(createProjectFileRecord(), ["vi", "fr-FR"])).toEqual([
      "vi",
      "fr-FR",
    ]);
  });

  it("returns provider locales for provider files", () => {
    const file = createProjectFileRecord({
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
    });

    expect(resolveProjectFileCatTargetLocales(file, ["vi"])).toEqual(["fr-FR"]);
  });
});
