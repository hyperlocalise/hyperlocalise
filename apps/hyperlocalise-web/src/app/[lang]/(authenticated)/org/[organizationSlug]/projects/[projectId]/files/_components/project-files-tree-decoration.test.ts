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

  it("shows the translated percentage with the approved split in the tooltip", () => {
    const decoration = buildProjectFileProgressDecoration(
      createProjectFileRecord({ sourcePath: "en.json" }),
      progress({ translationProgress: 40, approvalProgress: 0 }),
      intl,
    );

    expect(decoration).toEqual({
      text: "40%",
      title: "Translated 40% · Approved 0% · 12 strings",
      parts: [{ text: "40%", color: "var(--ds-blue-900)" }],
    });
  });

  it("colours untouched files muted and fully approved files green", () => {
    const file = createProjectFileRecord({ sourcePath: "en.json" });

    expect(
      buildProjectFileProgressDecoration(
        file,
        progress({ translationProgress: 0, approvalProgress: 0 }),
        intl,
      ),
    ).toMatchObject({ parts: [{ text: "0%", color: "var(--muted-foreground)" }] });
    expect(
      buildProjectFileProgressDecoration(file, progress({ approvalProgress: 100 }), intl),
    ).toMatchObject({ parts: [{ text: "100%", color: "var(--ds-green-900)" }] });
  });

  it("replaces progress with a hidden marker on hidden files", () => {
    const hiddenFile = createProjectFileRecord({ sourcePath: "en.json", isHidden: true });

    expect(buildProjectFileProgressDecoration(hiddenFile, progress({}), intl)).toEqual({
      text: "Hidden",
      title: "All strings in this file are hidden from translators",
    });
  });

  it("leaves visible files without progress or strings to the caller", () => {
    const file = createProjectFileRecord({ sourcePath: "en.json" });

    expect(buildProjectFileProgressDecoration(file, null, intl)).toBeNull();
    expect(
      buildProjectFileProgressDecoration(
        file,
        progress({ phrases: { total: 0, translated: 0, approved: 0 } }),
        intl,
      ),
    ).toBeNull();
  });
});
