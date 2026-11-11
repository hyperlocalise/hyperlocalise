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

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

import { filterProjectVisibleGuidelineDocuments } from "./guideline-project-visible-documents";

function doc(overrides: Partial<GuidelineDocument>): GuidelineDocument {
  return {
    id: "doc-1",
    projectId: null,
    locale: null,
    locales: [],
    isGlobal: false,
    title: "Test",
    filename: "t.md",
    contentType: "text/markdown",
    byteSize: 1,
    characterCount: 1,
    truncated: false,
    revisionId: "rev",
    version: 1,
    mandatory: false,
    status: "ready",
    errorCode: null,
    indexed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("filterProjectVisibleGuidelineDocuments", () => {
  it("keeps server-filtered rows until assignments are ready", () => {
    const documents = [doc({ id: "assigned" }), doc({ id: "other", isGlobal: false })];
    const assignments = new Map<string, string[]>();
    expect(
      filterProjectVisibleGuidelineDocuments(documents, "project_1", assignments, false),
    ).toHaveLength(2);
    expect(
      filterProjectVisibleGuidelineDocuments(documents, "project_1", assignments, true),
    ).toHaveLength(0);
  });

  it("shows global and explicitly assigned documents when assignments are ready", () => {
    const documents = [
      doc({ id: "global", isGlobal: true }),
      doc({ id: "assigned" }),
      doc({ id: "other" }),
    ];
    const assignments = new Map([["assigned", ["project_1"]]]);
    const visible = filterProjectVisibleGuidelineDocuments(
      documents,
      "project_1",
      assignments,
      true,
    );
    expect(visible.map((item) => item.id)).toEqual(["global", "assigned"]);
  });
});
