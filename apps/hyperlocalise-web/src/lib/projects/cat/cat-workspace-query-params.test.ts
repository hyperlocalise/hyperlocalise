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
  applyCatWorkspaceQueryParams,
  buildCatNavigationSearchParams,
  parseCatWorkspaceQueueFilterParam,
  parseCatWorkspaceQueueSortParam,
  parseCatWorkspaceSearchParam,
} from "./cat-workspace-query-params";

describe("parseCatWorkspaceQueueFilterParam", () => {
  it("accepts known filters and rejects unknown values", () => {
    expect(parseCatWorkspaceQueueFilterParam("needs_review")).toBe("needs_review");
    expect(parseCatWorkspaceQueueFilterParam("qa_issues")).toBe("qa_issues");
    expect(parseCatWorkspaceQueueFilterParam("unsaved")).toBeUndefined();
    expect(parseCatWorkspaceQueueFilterParam("skipped")).toBeUndefined();
    expect(parseCatWorkspaceQueueFilterParam(undefined)).toBeUndefined();
  });
});

describe("parseCatWorkspaceQueueSortParam", () => {
  it("accepts untranslated first and rejects unknown values", () => {
    expect(parseCatWorkspaceQueueSortParam("untranslated_first")).toBe("untranslated_first");
    expect(parseCatWorkspaceQueueSortParam("file_order")).toBe("file_order");
    expect(parseCatWorkspaceQueueSortParam("alpha")).toBeUndefined();
    expect(parseCatWorkspaceQueueSortParam(undefined)).toBeUndefined();
  });
});

describe("parseCatWorkspaceSearchParam", () => {
  it("trims search text", () => {
    expect(parseCatWorkspaceSearchParam("  hello  ")).toBe("hello");
    expect(parseCatWorkspaceSearchParam("   ")).toBe("");
  });
});

describe("applyCatWorkspaceQueryParams", () => {
  it("writes non-default filter and search, and clears defaults", () => {
    const params = new URLSearchParams("locale=vi&queueFilter=untranslated&search=old");
    const next = applyCatWorkspaceQueryParams(params, {
      queueFilter: "all",
      search: "",
    });
    expect(next.get("locale")).toBe("vi");
    expect(next.get("queueFilter")).toBeNull();
    expect(next.get("search")).toBeNull();

    const withValues = applyCatWorkspaceQueryParams(params, {
      queueFilter: "needs_review",
      queueSort: "untranslated_first",
      search: "checkout",
    });
    expect(withValues.get("queueFilter")).toBe("needs_review");
    expect(withValues.get("queueSort")).toBe("untranslated_first");
    expect(withValues.get("search")).toBe("checkout");

    const clearedSort = applyCatWorkspaceQueryParams(withValues, {
      queueSort: "file_order",
    });
    expect(clearedSort.get("queueSort")).toBeNull();
  });
});

describe("buildCatNavigationSearchParams", () => {
  it("preserves filter and search when only locale changes", () => {
    const next = buildCatNavigationSearchParams(
      "locale=fr&queueFilter=untranslated&search=save&sourcePath=a.json",
      { locale: "vi" },
    );
    expect(next.get("locale")).toBe("vi");
    expect(next.get("queueFilter")).toBe("untranslated");
    expect(next.get("search")).toBe("save");
    expect(next.get("sourcePath")).toBe("a.json");
  });

  it("preserves queue sort when only the file changes", () => {
    const next = buildCatNavigationSearchParams(
      "locale=fr&queueFilter=qa_issues&queueSort=untranslated_first&sourcePath=a.json&segment=hero.title",
      { sourcePath: "b.json", segment: null },
    );
    expect(next.get("sourcePath")).toBe("b.json");
    expect(next.get("queueFilter")).toBe("qa_issues");
    expect(next.get("queueSort")).toBe("untranslated_first");
    expect(next.get("segment")).toBeNull();
  });
});
