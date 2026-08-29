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

import {
  buildCatFilePagination,
  resolveProjectFileContentEditorPagination,
} from "./project-file-content-editor-pagination";

describe("resolveProjectFileContentEditorPagination", () => {
  it("defaults to paginated mode when pagination params are omitted", () => {
    expect(resolveProjectFileContentEditorPagination({})).toEqual({
      offset: 0,
      limit: 50,
      search: undefined,
      queueFilter: "all",
      queueSort: "file_order",
      paginated: true,
    });
  });

  it("enables paginated mode when offset is provided", () => {
    expect(resolveProjectFileContentEditorPagination({ offset: 50, limit: 25 })).toEqual({
      offset: 50,
      limit: 25,
      search: undefined,
      queueFilter: "all",
      queueSort: "file_order",
      paginated: true,
    });
  });

  it("enables paginated mode when search is provided", () => {
    expect(resolveProjectFileContentEditorPagination({ search: "  hello  " })).toMatchObject({
      offset: 0,
      limit: 50,
      search: "hello",
      paginated: true,
    });
  });

  it("enables paginated mode when queueFilter is provided", () => {
    expect(
      resolveProjectFileContentEditorPagination({ queueFilter: "untranslated" }),
    ).toMatchObject({
      offset: 0,
      limit: 50,
      queueFilter: "untranslated",
      paginated: true,
    });
  });

  it("enables paginated mode when queueSort is provided", () => {
    expect(
      resolveProjectFileContentEditorPagination({ queueSort: "untranslated_first" }),
    ).toMatchObject({
      offset: 0,
      limit: 50,
      queueSort: "untranslated_first",
      paginated: true,
    });
  });

  it("caps limit at the maximum page size", () => {
    expect(resolveProjectFileContentEditorPagination({ limit: 500 })).toMatchObject({
      limit: 100,
      paginated: true,
    });
  });
});

describe("buildCatFilePagination", () => {
  it("computes hasMore from offset, returned count, and total", () => {
    expect(
      buildCatFilePagination({ offset: 0, limit: 50, returnedCount: 50, totalCount: 120 }),
    ).toMatchObject({ hasMore: true });

    expect(
      buildCatFilePagination({ offset: 100, limit: 50, returnedCount: 20, totalCount: 120 }),
    ).toMatchObject({ hasMore: false });
  });

  it("honors an explicit hasMore override", () => {
    expect(
      buildCatFilePagination({
        offset: 4_950,
        limit: 50,
        returnedCount: 50,
        totalCount: 5_000,
        hasMore: true,
      }),
    ).toMatchObject({ hasMore: true });
  });

  it("forwards Crowdin untranslated-first bucket cursors", () => {
    expect(
      buildCatFilePagination({
        offset: 50,
        limit: 50,
        returnedCount: 50,
        totalCount: 101,
        hasMore: true,
        nextSortBucket: 1,
        nextSortBucketOffset: 10,
      }),
    ).toMatchObject({
      hasMore: true,
      nextSortBucket: 1,
      nextSortBucketOffset: 10,
    });
  });
});
