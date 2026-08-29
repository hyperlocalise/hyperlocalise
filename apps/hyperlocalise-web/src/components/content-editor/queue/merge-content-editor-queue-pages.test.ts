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

import type { ProjectFileContentEditorQueuePage } from "@/components/content-editor/project-file/project-file-content-editor-api";
import { mergeContentEditorQueuePages } from "./merge-content-editor-queue-pages";

function queuePage(
  segments: ProjectFileContentEditorQueuePage["segments"],
  pagination: NonNullable<ProjectFileContentEditorQueuePage["pagination"]>,
): ProjectFileContentEditorQueuePage {
  return {
    sourcePath: "home.json",
    filename: "home.json",
    provider: null,
    targetLocale: "fr",
    canEditTranslations: true,
    truncated: pagination.hasMore,
    segments,
    pagination,
  };
}

describe("mergeContentEditorQueuePages", () => {
  it("concatenates segments across pages and preserves hasMore from the last page", () => {
    const merged = mergeContentEditorQueuePages([
      queuePage(
        [
          {
            externalStringId: "1",
            key: "a",
            sourceText: "A",
            context: null,
            type: null,
          },
        ],
        { offset: 0, limit: 1, returnedCount: 1, totalCount: 2, hasMore: true },
      ),
      queuePage(
        [
          {
            externalStringId: "2",
            key: "b",
            sourceText: "B",
            context: null,
            type: null,
          },
        ],
        { offset: 1, limit: 1, returnedCount: 1, totalCount: 2, hasMore: false },
      ),
    ]);

    expect(merged?.segments).toHaveLength(2);
    expect(merged?.pagination).toMatchObject({
      offset: 0,
      returnedCount: 2,
      hasMore: false,
    });
  });
});
