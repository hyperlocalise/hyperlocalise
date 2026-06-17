import { describe, expect, it } from "vite-plus/test";

import { projectFileCatQueryKey } from "./project-file-cat-api";

describe("projectFileCatQueryKey", () => {
  it("includes search, limit, and offset for page-scoped cache keys", () => {
    expect(
      projectFileCatQueryKey({
        organizationSlug: "acme",
        projectId: "project_1",
        sourcePath: "locales/en.json",
        targetLocale: "fr",
        repositoryFullName: "acme/web",
        search: "hero",
        limit: 50,
        offset: 50,
      }),
    ).toEqual([
      "project-file-cat",
      "acme",
      "project_1",
      "locales/en.json",
      "fr",
      "acme/web",
      "hero",
      50,
      50,
    ]);
  });

  it("uses distinct keys for adjacent pages so prefetch can warm the next page", () => {
    const base = {
      organizationSlug: "acme",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr",
      repositoryFullName: null,
      search: "",
      limit: 50,
    };

    const page0 = projectFileCatQueryKey({ ...base, offset: 0 });
    const page1 = projectFileCatQueryKey({ ...base, offset: 50 });

    expect(page0).not.toEqual(page1);
    expect(page1.at(-1)).toBe(50);
  });
});
