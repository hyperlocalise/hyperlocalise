import { describe, expect, it } from "vite-plus/test";

import {
  buildCatFilePagination,
  resolveProjectFileCatPagination,
} from "./project-file-cat-pagination";

describe("resolveProjectFileCatPagination", () => {
  it("defaults to paginated mode when pagination params are omitted", () => {
    expect(resolveProjectFileCatPagination({})).toEqual({
      offset: 0,
      limit: 50,
      search: undefined,
      queueFilter: "all",
      paginated: true,
    });
  });

  it("enables paginated mode when offset is provided", () => {
    expect(resolveProjectFileCatPagination({ offset: 50, limit: 25 })).toEqual({
      offset: 50,
      limit: 25,
      search: undefined,
      queueFilter: "all",
      paginated: true,
    });
  });

  it("enables paginated mode when search is provided", () => {
    expect(resolveProjectFileCatPagination({ search: "  hello  " })).toMatchObject({
      offset: 0,
      limit: 50,
      search: "hello",
      paginated: true,
    });
  });

  it("enables paginated mode when queueFilter is provided", () => {
    expect(resolveProjectFileCatPagination({ queueFilter: "needs_review" })).toMatchObject({
      offset: 0,
      limit: 50,
      queueFilter: "needs_review",
      paginated: true,
    });
  });

  it("caps limit at the maximum page size", () => {
    expect(resolveProjectFileCatPagination({ limit: 500 })).toMatchObject({
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
});
