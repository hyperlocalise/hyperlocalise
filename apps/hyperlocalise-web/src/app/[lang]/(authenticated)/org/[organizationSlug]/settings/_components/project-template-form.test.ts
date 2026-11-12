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
import { createIntl } from "@formatjs/intl";
import { describe, expect, it } from "vite-plus/test";

import {
  createEmptyProjectTemplateForm,
  keepGlossariesForSourceLocale,
  projectTemplateFormFromRecord,
  toggleOrderedId,
  toProjectTemplateBody,
  validateProjectTemplateForm,
} from "./project-template-form";

const intl = createIntl({ locale: "en-US" });

describe("project template form", () => {
  it("keeps picks in the order they were chosen", () => {
    expect(toggleOrderedId([], "a")).toEqual(["a"]);
    expect(toggleOrderedId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleOrderedId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("drops glossaries that no longer match the source locale", () => {
    const glossaries = [
      { id: "g-en", name: "EN", sourceLocale: "en-US" },
      { id: "g-zh", name: "ZH", sourceLocale: "zh-CN" },
    ];
    expect(keepGlossariesForSourceLocale(["g-en", "g-zh"], glossaries, "zh-CN")).toEqual(["g-zh"]);
    // Unknown glossaries (not loaded) are left for the server to check.
    expect(keepGlossariesForSourceLocale(["g-other"], glossaries, "zh-CN")).toEqual(["g-other"]);
  });

  it("requires a name and valid locales", () => {
    const errors = validateProjectTemplateForm(createEmptyProjectTemplateForm(), intl);
    expect(errors.name).toBeDefined();
    expect(errors.targetLocales).toBeDefined();

    const clash = validateProjectTemplateForm(
      { ...createEmptyProjectTemplateForm(), name: "UI", targetLocales: ["en-US"] },
      intl,
    );
    expect(clash.targetLocales).toBeDefined();
  });

  it("builds a canonical body that round-trips a record", () => {
    const record = {
      id: "t1",
      name: " UI strings ",
      description: "",
      sourceLocale: "zh-cn",
      targetLocales: ["en-us", "es-419"],
      projectDescription: "",
      translationContext: " Formal tone ",
      teamId: null,
      automaticallyGroupIdenticalStrings: false,
      sourceTextEditable: true,
      approvedTranslationsOnSourceChange: "needs_review" as const,
      memoryIds: ["m2", "m1"],
      glossaryIds: [],
      createdAt: "2026-11-12T00:00:00.000Z",
      updatedAt: "2026-11-12T00:00:00.000Z",
    };
    const values = projectTemplateFormFromRecord(record);
    expect(validateProjectTemplateForm(values, intl)).toEqual({});
    expect(toProjectTemplateBody(values)).toMatchObject({
      name: "UI strings",
      sourceLocale: "zh-CN",
      targetLocales: ["en-US", "es-419"],
      translationContext: "Formal tone",
      teamId: null,
      sourceTextEditable: true,
      memoryIds: ["m2", "m1"],
    });
  });
});
