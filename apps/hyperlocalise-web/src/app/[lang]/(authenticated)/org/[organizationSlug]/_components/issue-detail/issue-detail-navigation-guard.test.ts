// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { getInternalNavigationHrefFromClick } from "./issue-detail-navigation-guard";

describe("getInternalNavigationHrefFromClick", () => {
  const current = "https://app.example.com/org/acme/projects/p1/issue-sheet/i1";

  it("returns null for non-link targets", () => {
    expect(getInternalNavigationHrefFromClick(document.createElement("div"), current)).toBeNull();
  });

  it("returns null for same-page href", () => {
    const anchor = document.createElement("a");
    anchor.href = "/org/acme/projects/p1/issue-sheet/i1";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBeNull();

    anchor.remove();
  });

  it("returns internal path for in-app navigation", () => {
    const anchor = document.createElement("a");
    anchor.href = "/org/acme/issues";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBe("/org/acme/issues");

    anchor.remove();
  });

  it("returns null for external origins", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://other.example.com/page";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBeNull();

    anchor.remove();
  });
});
