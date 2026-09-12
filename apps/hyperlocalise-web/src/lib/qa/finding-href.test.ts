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

import { buildTranslationQaFindingHref } from "./finding-href";

describe("buildTranslationQaFindingHref", () => {
  it("points at the CAT editor for the key and locale", () => {
    expect(
      buildTranslationQaFindingHref({
        organizationSlug: "acme",
        projectId: "proj_1",
        sourcePath: "locales/en.json",
        targetLocale: "fr-FR",
        key: "hello.title",
      }),
    ).toBe(
      "/org/acme/projects/proj_1/files/content-editor?sourcePath=locales%2Fen.json&locale=fr-FR&segment=hello.title",
    );
  });
});
