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

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

import {
  buildProjectFileContentEditorAllFilesHref,
  buildProjectFileContentEditorHref,
  buildProjectStringsHref,
  canOpenProjectFileContentEditor,
  parseProjectFileContentEditorSearchParams,
  resolveProjectContentEditorTargetLocale,
  resolveProjectFileContentEditorTargetLocale,
  resolveProjectFileContentEditorTargetLocaleResolution,
  resolveProjectFileContentEditorTargetLocales,
} from "./project-file-content-editor-routing";

describe("canOpenProjectFileContentEditor", () => {
  it("allows provider files supported by the live CAT workspace", () => {
    expect(
      canOpenProjectFileContentEditor(
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
    expect(canOpenProjectFileContentEditor(createProjectFileRecord())).toBe(true);
  });

  it("rejects native files without a stored file id", () => {
    expect(
      canOpenProjectFileContentEditor(
        createProjectFileRecord({
          storedFileId: null,
        }),
      ),
    ).toBe(false);
  });
});

describe("buildProjectFileContentEditorHref", () => {
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

    expect(
      buildProjectFileContentEditorHref("acme", "crowdin:project_website", file, "de-DE"),
    ).toBe(
      "/org/acme/projects/crowdin%3Aproject_website/files/content-editor?sourcePath=crowdin%2Fhome.json&locale=de-DE&externalResourceId=file_home_json",
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

    expect(
      buildProjectFileContentEditorHref("acme", "phrase:project_website", file, null),
    ).toContain("resourceType=key");
    expect(
      buildProjectFileContentEditorHref("acme", "phrase:project_website", file, null),
    ).toContain("externalResourceId=key-welcome");
  });

  it("builds native CAT hrefs with source path and optional locale", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(buildProjectFileContentEditorHref("acme", "project_website", file, "fr-FR")).toBe(
      "/org/acme/projects/project_website/files/content-editor?sourcePath=marketing%2Fhome.json&locale=fr-FR",
    );
  });

  it("preserves the provider branch filter in CAT hrefs", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(
      buildProjectFileContentEditorHref("acme", "project_website", file, "fr-FR", "main"),
    ).toBe(
      "/org/acme/projects/project_website/files/content-editor?sourcePath=marketing%2Fhome.json&locale=fr-FR&branch=main",
    );
  });

  it("falls back to the first native project target locale", () => {
    const file = createProjectFileRecord({
      sourcePath: "marketing/home.json",
    });

    expect(
      buildProjectFileContentEditorHref("acme", "project_website", file, null, null, [
        "vi",
        "fr-FR",
      ]),
    ).toBe(
      "/org/acme/projects/project_website/files/content-editor?sourcePath=marketing%2Fhome.json&locale=vi",
    );
  });
});

describe("resolveProjectFileContentEditorTargetLocale", () => {
  it("uses the requested native locale when it belongs to the project", () => {
    expect(
      resolveProjectFileContentEditorTargetLocale(createProjectFileRecord(), "fr-FR", [
        "vi",
        "fr-FR",
      ]),
    ).toBe("fr-FR");
  });

  it("falls back to the first configured native project target locale", () => {
    expect(
      resolveProjectFileContentEditorTargetLocale(createProjectFileRecord(), null, ["vi", "fr-FR"]),
    ).toBe("vi");
  });

  it("reports fallback from an unknown requested native locale to a project locale", () => {
    expect(
      resolveProjectFileContentEditorTargetLocaleResolution(createProjectFileRecord(), "ja-JP", [
        "vi",
      ]),
    ).toMatchObject({
      requestedLocale: "ja-JP",
      status: "fallback",
      targetLocale: "vi",
      targetLocales: ["vi"],
    });
  });

  it("returns null when native project locales are known to be empty", () => {
    expect(resolveProjectFileContentEditorTargetLocale(createProjectFileRecord(), "vi", [])).toBe(
      null,
    );
  });

  it("can infer native locales from file readiness when project data is not supplied", () => {
    expect(
      resolveProjectFileContentEditorTargetLocale(
        createProjectFileRecord({ localeReadiness: { vi: "missing" } }),
        null,
      ),
    ).toBe("vi");
  });
});

describe("resolveProjectFileContentEditorTargetLocales", () => {
  it("returns native project locales when supplied", () => {
    expect(
      resolveProjectFileContentEditorTargetLocales(createProjectFileRecord(), ["vi", "fr-FR"]),
    ).toEqual(["vi", "fr-FR"]);
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

    expect(resolveProjectFileContentEditorTargetLocales(file, ["vi"])).toEqual(["fr-FR"]);
  });
});

describe("buildProjectFileContentEditorAllFilesHref", () => {
  it("builds an all-files CAT href with locale", () => {
    expect(buildProjectFileContentEditorAllFilesHref("acme", "proj_1", "fr-FR")).toBe(
      "/org/acme/projects/proj_1/files/content-editor?sourcePath=*&locale=fr-FR",
    );
  });

  it("builds the project Content Editor sidebar href", () => {
    expect(buildProjectStringsHref("acme", "proj_1", "de-DE")).toBe(
      "/org/acme/projects/proj_1/strings?sourcePath=*&locale=de-DE",
    );
  });
});

describe("parseProjectFileContentEditorSearchParams", () => {
  it("treats sourcePath=* as all-files mode", () => {
    expect(
      parseProjectFileContentEditorSearchParams({
        sourcePath: "*",
        locale: "fr-FR",
      }),
    ).toEqual({
      sourcePath: null,
      allFiles: true,
      highlightLocale: "fr-FR",
      initialSegmentKey: null,
      externalResourceId: null,
      resourceType: null,
      branch: null,
      sourcePaths: null,
    });
  });
});

describe("resolveProjectContentEditorTargetLocale", () => {
  it("prefers an exact match then falls back to the first locale", () => {
    expect(resolveProjectContentEditorTargetLocale(["fr-FR", "de-DE"], "de-DE")).toBe("de-DE");
    expect(resolveProjectContentEditorTargetLocale(["fr-FR", "de-DE"], "it-IT")).toBe("fr-FR");
    expect(resolveProjectContentEditorTargetLocale([], null)).toBeNull();
  });
});
