import { describe, expect, it } from "vite-plus/test";

import { FIGMA_LOCALE_STATUS_PAGE_LIMIT, resolveSelectedPageIds } from "./page-selection";

describe("resolveSelectedPageIds", () => {
  const pages = Array.from({ length: 52 }, (_, index) => ({
    pageId: `page-${index + 1}`,
    pageName: `Page ${index + 1}`,
  }));

  it("caps a first-open selection to the locale endpoint page limit", () => {
    const selected = resolveSelectedPageIds([], pages);
    expect(selected).toHaveLength(FIGMA_LOCALE_STATUS_PAGE_LIMIT);
    expect(selected[0]).toBe("page-1");
    expect(selected[selected.length - 1]).toBe("page-50");
  });

  it("caps a saved selection that exceeds the locale endpoint page limit", () => {
    const saved = pages.map((page) => page.pageId);
    expect(resolveSelectedPageIds(saved, pages)).toHaveLength(FIGMA_LOCALE_STATUS_PAGE_LIMIT);
  });

  it("keeps a valid saved selection under the limit", () => {
    expect(resolveSelectedPageIds(["page-3", "page-4"], pages)).toEqual(["page-3", "page-4"]);
  });
});
