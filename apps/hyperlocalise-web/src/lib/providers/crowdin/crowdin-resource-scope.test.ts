import { describe, expect, it } from "vite-plus/test";

import { isCrowdinResourceLinkedToProject } from "./crowdin-resource-scope";

describe("isCrowdinResourceLinkedToProject", () => {
  it("returns false when no project links are present", () => {
    expect(
      isCrowdinResourceLinkedToProject({
        projectId: 42,
        projectIds: [],
        defaultProjectIds: [],
      }),
    ).toBe(false);
  });

  it("returns true when the project is explicitly linked", () => {
    expect(
      isCrowdinResourceLinkedToProject({
        projectId: 42,
        projectIds: [7, 42],
        defaultProjectIds: [],
      }),
    ).toBe(true);
  });

  it("returns true when the project is listed as a default project", () => {
    expect(
      isCrowdinResourceLinkedToProject({
        projectId: 42,
        projectIds: [],
        defaultProjectIds: [42],
      }),
    ).toBe(true);
  });
});
