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

import type { ProjectFileCatGroupOccurrence } from "@/api/routes/project/project.schema";

import {
  flattenGroupOccurrenceComments,
  representativeTargetFromOccurrences,
} from "./use-cat-group-occurrences";

function occurrence(
  overrides: Partial<ProjectFileCatGroupOccurrence> = {},
): ProjectFileCatGroupOccurrence {
  return {
    translationKeyId: "key-1",
    key: "save",
    sourcePath: "locales/en.json",
    context: null,
    comments: [],
    isLocked: false,
    target: null,
    reviewState: null,
    ...overrides,
  };
}

describe("group occurrence helpers", () => {
  it("uses the first persisted occurrence target as the group representative", () => {
    expect(
      representativeTargetFromOccurrences([
        occurrence(),
        occurrence({
          translationKeyId: "key-2",
          target: { text: "Enregistrer", externalTranslationId: "t1", isApproved: true },
        }),
      ]),
    ).toEqual({ text: "Enregistrer", externalTranslationId: "t1", isApproved: true });
  });

  it("flattens comments from every occurrence", () => {
    expect(
      flattenGroupOccurrenceComments([
        occurrence({
          comments: [
            {
              externalCommentId: "c1",
              type: "comment",
              status: null,
              text: "First",
              createdAt: null,
              locale: "fr",
            },
          ],
        }),
        occurrence({
          translationKeyId: "key-2",
          comments: [
            {
              externalCommentId: "c2",
              type: "issue",
              status: "unresolved",
              text: "Second",
              createdAt: null,
              locale: "fr",
            },
          ],
        }),
      ]).map((comment) => comment.externalCommentId),
    ).toEqual(["c1", "c2"]);
  });
});
