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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import type { schema } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import { isTranslationSourceDestination, sendTranslationAsSource } from "./translation-as-source";

type ProjectRecord = typeof schema.projects.$inferSelect;

function nativeProject(
  values: Pick<ProjectRecord, "id" | "sourceLocale" | "targetLocales"> &
    Partial<Pick<ProjectRecord, "source">>,
): ProjectRecord {
  return {
    id: values.id,
    source: values.source ?? "native",
    sourceLocale: values.sourceLocale,
    targetLocales: values.targetLocales,
  } as ProjectRecord;
}

const chinese = nativeProject({
  id: "project_zh",
  sourceLocale: "zh-CN",
  targetLocales: ["en-US", "zh-TW"],
});
const english = nativeProject({
  id: "project_en",
  sourceLocale: "en-US",
  targetLocales: ["de-DE"],
});

describe("isTranslationSourceDestination", () => {
  it("accepts another native project whose source language is one of this project's languages", () => {
    expect(isTranslationSourceDestination(chinese, english)).toBe(true);
  });

  it("refuses the same project, a live TMS project, or a missing source language", () => {
    expect(isTranslationSourceDestination(chinese, chinese)).toBe(false);
    expect(
      isTranslationSourceDestination(
        chinese,
        nativeProject({ ...english, source: "external_tms" }),
      ),
    ).toBe(false);
    expect(
      isTranslationSourceDestination(
        english,
        nativeProject({ ...chinese, source: "external_tms" }),
      ),
    ).toBe(false);
    expect(
      isTranslationSourceDestination(
        chinese,
        nativeProject({ id: "project_blank", sourceLocale: null, targetLocales: ["de-DE"] }),
      ),
    ).toBe(false);
  });

  it("refuses a project whose source language is not a target of the sending project", () => {
    expect(
      isTranslationSourceDestination(
        chinese,
        nativeProject({ id: "project_fr", sourceLocale: "fr-FR", targetLocales: ["de-DE"] }),
      ),
    ).toBe(false);
  });
});

describe("sendTranslationAsSource", () => {
  const actorUserId = "00000000-0000-4000-8000-000000000001";
  const organizationId = "11111111-1111-4111-8111-111111111111";

  it("refuses before reading files when the projects or file cannot be sent", async () => {
    const cases = [
      {
        sourcePath: "locales/en.json",
        destination: english,
        locale: "en-US",
        code: "unsupported_file_format",
      },
      {
        sourcePath: "requests/report.docx",
        destination: chinese,
        locale: "en-US",
        code: "same_project",
      },
      {
        sourcePath: "requests/report.docx",
        destination: nativeProject({ ...english, source: "external_tms" }),
        locale: "en-US",
        code: "project_not_native",
      },
      {
        sourcePath: "requests/report.docx",
        destination: english,
        locale: "fr-FR",
        code: "locale_not_a_target",
      },
      {
        sourcePath: "requests/report.docx",
        destination: english,
        locale: "zh-TW",
        code: "destination_source_locale_mismatch",
      },
    ] as const;

    for (const testCase of cases) {
      const sent = await sendTranslationAsSource({
        organizationId,
        sourceProject: chinese,
        destinationProject: testCase.destination,
        sourcePath: testCase.sourcePath,
        locale: testCase.locale,
        actorUserId,
      });
      expect(isErr(sent) ? sent.error.code : "ok").toBe(testCase.code);
    }
  });
});
