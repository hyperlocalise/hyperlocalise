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

import { ContentEditorPageStore } from "./content-editor-page-store";

describe("ContentEditorPageStore", () => {
  it("applies chrome and keeps it when the open file changes", () => {
    const store = new ContentEditorPageStore();
    const files = [
      createProjectFileRecord({ sourcePath: "en-US.json", filename: "en-US.json" }),
      createProjectFileRecord({ sourcePath: "pricing.json", filename: "pricing.json" }),
    ];

    store.applyChrome({
      files,
      selectedSourcePath: "en-US.json",
      allFiles: false,
      canUseAllFiles: true,
      targetLocale: "vi",
      targetLocales: ["vi", "fr-FR"],
      repositoryFullNames: ["acme/web"],
      selectedRepositoryFullName: "acme/web",
      activitySourcePath: "en-US.json",
      organizationSlug: "acme",
      projectId: "proj_1",
      showFileSidebar: true,
    });

    store.beginFileScopeChange("pricing.json", "fr-FR");

    expect(store.selectedSourcePath).toBe("pricing.json");
    expect(store.targetLocale).toBe("fr-FR");
    expect(store.activitySourcePath).toBe("pricing.json");
    expect(store.files).toEqual(files);
    expect(store.showFileSidebar).toBe(true);
    expect(store.canUseAllFiles).toBe(true);
  });
});
