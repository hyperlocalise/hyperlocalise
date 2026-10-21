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
import { createIntl } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileProgressRecord } from "@/api/routes/project/project.schema";

import { createProjectFileRecord } from "./project-files.fixture";
import {
  buildProjectFileProgressDecoration,
  buildProjectFileProgressLookup,
  findProjectFileProgress,
} from "./project-files-tree-decoration";

const intl = createIntl({ locale: "en", onError: () => undefined });

function progress(overrides: Partial<ProjectFileProgressRecord>): ProjectFileProgressRecord {
  return {
    translationProgress: 100,
    approvalProgress: 97,
    phrases: { total: 12, translated: 12, approved: 11 },
    ...overrides,
  };
}

describe("project files tree decoration", () => {
  it("matches native rows by path and TMS rows by provider file id", () => {
    const lookup = buildProjectFileProgressLookup([
      progress({ sourcePath: "en.json" }),
      progress({ externalResourceId: "42", translationProgress: 10 }),
    ]);
    const tmsFile = createProjectFileRecord({
      sourcePath: "messages.pot",
      provider: { externalResourceId: "42" } as never,
    });

    expect(
      findProjectFileProgress(lookup, createProjectFileRecord({ sourcePath: "en.json" })),
    ).toMatchObject({ sourcePath: "en.json" });
    expect(findProjectFileProgress(lookup, tmsFile)?.translationProgress).toBe(10);
    expect(
      findProjectFileProgress(lookup, createProjectFileRecord({ sourcePath: "x.json" })),
    ).toBeNull();
  });

  it("colours translated and approved percentages", () => {
    const decoration = buildProjectFileProgressDecoration(
      createProjectFileRecord({ sourcePath: "en.json" }),
      progress({ approvalProgress: 0 }),
      intl,
    );

    expect(decoration).toMatchObject({
      text: "100% · 0%",
      title: "Translated 100% · Approved 0% · 12 strings",
      parts: [
        { text: "100%", color: "var(--ds-blue-900)" },
        { text: " · ", color: "var(--muted-foreground)" },
        { text: "0%", color: "var(--muted-foreground)" },
      ],
    });
  });

  it("marks hidden files with or without progress", () => {
    const hiddenFile = createProjectFileRecord({ sourcePath: "en.json", isHidden: true });

    expect(buildProjectFileProgressDecoration(hiddenFile, null, intl)).toMatchObject({
      text: "Hidden",
    });
    expect(
      buildProjectFileProgressDecoration(
        hiddenFile,
        progress({ phrases: { total: 0, translated: 0, approved: 0 } }),
        intl,
      ),
    ).toMatchObject({
      text: "Hidden · 100% · 97%",
      title: "All strings in this file are hidden from translators\nNo strings to translate",
    });
  });

  it("leaves visible files without progress to the caller", () => {
    expect(
      buildProjectFileProgressDecoration(
        createProjectFileRecord({ sourcePath: "en.json" }),
        null,
        intl,
      ),
    ).toBeNull();
  });
});
