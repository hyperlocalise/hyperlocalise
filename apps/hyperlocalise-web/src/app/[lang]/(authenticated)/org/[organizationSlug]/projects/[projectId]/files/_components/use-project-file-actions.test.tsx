/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { createProjectFileRecord, providerProjectFilesFixture } from "./project-files.fixture";
import { useProjectFileActions } from "./use-project-file-actions";

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <IntlProvider locale="en" messages={{}}>
      {children}
    </IntlProvider>
  );
}

function renderProjectFileActions({
  file = createProjectFileRecord(),
  highlightLocale = "fr-FR",
  projectTargetLocales = ["vi", "fr-FR"],
  branch = "main",
}: Partial<Parameters<typeof useProjectFileActions>[0]> = {}) {
  return renderHook(
    () =>
      useProjectFileActions({
        organizationSlug: "acme",
        projectId: "project_website",
        file,
        highlightLocale,
        projectTargetLocales,
        sourceLocale: "en-US",
        nativeSourcePaths: ["marketing/home.json", "marketing/pricing.json"],
        branch,
      }),
    { wrapper: IntlWrapper },
  );
}

describe("useProjectFileActions", () => {
  it("enables CAT and agent translation for a stored native file in a supported format", () => {
    const { result } = renderProjectFileActions({
      file: createProjectFileRecord({
        sourcePath: "marketing/home.json",
        storedFileId: "file_home_json",
      }),
    });

    expect(result.current.isNativeFile).toBe(true);
    expect(result.current.canOpenCat).toBe(true);
    expect(result.current.canTranslateWithAgent).toBe(true);
    expect(result.current.translateDisabledTitle).toBeUndefined();
    expect(result.current.catHref).toBe(
      "/org/acme/projects/project_website/files/cat?sourcePath=marketing%2Fhome.json&locale=fr-FR&branch=main",
    );
    expect(result.current.stableTargetLocales).toEqual(["vi", "fr-FR"]);

    act(() => result.current.setTranslateDialogOpen(true));

    expect(result.current.translateDialogOpen).toBe(true);
  });

  it("keeps provider files out of native-only agent translation flows", () => {
    const providerFile = providerProjectFilesFixture[0]!;
    const { result } = renderProjectFileActions({
      file: providerFile,
      projectTargetLocales: ["vi"],
    });

    expect(result.current.isNativeFile).toBe(false);
    expect(result.current.canOpenCat).toBe(true);
    expect(result.current.canTranslateWithAgent).toBe(false);
    expect(result.current.catHref).toBe(
      "/org/acme/projects/project_website/files/cat?sourcePath=crowdin%2Fhome.json&locale=fr-FR&branch=main&externalResourceId=file_home_json",
    );
  });

  it("disables agent translation when the native file is not runnable", () => {
    const unsupportedFile = createProjectFileRecord({
      sourcePath: "marketing/brief.pdf",
      storedFileId: "file_brief_pdf",
    });
    const missingStoredFile = createProjectFileRecord({
      sourcePath: "marketing/home.json",
      storedFileId: null,
    });
    const noTargetLocales = createProjectFileRecord({
      sourcePath: "marketing/home.json",
      storedFileId: "file_home_json",
    });

    for (const file of [unsupportedFile, missingStoredFile]) {
      const { result } = renderProjectFileActions({ file });

      expect(result.current.isNativeFile).toBe(true);
      expect(result.current.canTranslateWithAgent).toBe(false);
      expect(result.current.translateDisabledTitle).toBe(
        "Upload a supported file and add target locales in project settings to translate with agent.",
      );
    }

    const { result } = renderProjectFileActions({
      file: noTargetLocales,
      projectTargetLocales: [],
    });

    expect(result.current.canTranslateWithAgent).toBe(false);
    expect(result.current.translateDisabledTitle).toBe(
      "Upload a supported file and add target locales in project settings to translate with agent.",
    );
  });

  it("enables agent translation for native image source files", () => {
    const { result } = renderProjectFileActions({
      file: createProjectFileRecord({
        sourcePath: "marketing/hero.png",
        storedFileId: "file_hero_png",
      }),
    });

    expect(result.current.isNativeFile).toBe(true);
    expect(result.current.canTranslateWithAgent).toBe(true);
    expect(result.current.translateDisabledTitle).toBeUndefined();
  });
});
