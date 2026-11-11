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

import { assignableGuidelinesForProject } from "./guideline-project-document-picker";

function doc(overrides: Partial<GuidelineDocument>): GuidelineDocument {
  return {
    id: "doc-1",
    projectId: null,
    locale: null,
    locales: [],
    isGlobal: false,
    title: "Test",
    filename: "test.md",
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

describe("assignableGuidelinesForProject", () => {
  it("excludes global, legacy project-owned, and already-assigned documents", () => {
    const documents = [
      doc({ id: "global", isGlobal: true }),
      doc({ id: "legacy", projectId: "project_old" }),
      doc({ id: "free", title: "Free doc" }),
      doc({ id: "taken", title: "Taken doc" }),
    ];
    const assignments = new Map([
      ["taken", ["project_1"]],
      ["free", ["project_2"]],
    ]);
    const result = assignableGuidelinesForProject(documents, assignments, "project_1");
    expect(result.map((item) => item.id)).toEqual(["free"]);
  });
});
