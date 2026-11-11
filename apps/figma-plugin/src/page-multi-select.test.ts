import { describe, expect, it } from "vite-plus/test";

import { pagesMultiSelectLabel } from "./page-multi-select";

describe("pagesMultiSelectLabel", () => {
  const pages = [
    { pageId: "a", pageName: "Home" },
    { pageId: "b", pageName: "About" },
    { pageId: "c", pageName: "Contact" },
  ];

  it("returns empty when nothing is selected", () => {
    expect(pagesMultiSelectLabel([], pages)).toBe("");
  });

  it("joins up to two page names", () => {
    expect(pagesMultiSelectLabel(["a", "b"], pages)).toBe("Home, About");
  });

  it("summarizes three or more selections", () => {
    expect(pagesMultiSelectLabel(["a", "b", "c"], pages)).toBe("3 pages selected");
  });
});
