import { describe, expect, it } from "vite-plus/test";

import { selectJobCatRepository, sortJobCatProviderFiles } from "./select-job-cat-repository";

describe("selectJobCatRepository", () => {
  it("returns the saved repository when it is still enabled", () => {
    expect(
      selectJobCatRepository({
        enabledRepositoryFullNames: ["acme/web", "acme/docs"],
        savedRepositoryFullName: "acme/docs",
      }),
    ).toBe("acme/docs");
  });

  it("auto-selects the only enabled repository", () => {
    expect(
      selectJobCatRepository({
        enabledRepositoryFullNames: ["acme/web"],
        savedRepositoryFullName: null,
      }),
    ).toBe("acme/web");
  });

  it("requires an explicit choice when multiple repositories are enabled", () => {
    expect(
      selectJobCatRepository({
        enabledRepositoryFullNames: ["acme/web", "acme/docs"],
        savedRepositoryFullName: null,
      }),
    ).toBeNull();
  });

  it("ignores a saved repository that is no longer enabled", () => {
    expect(
      selectJobCatRepository({
        enabledRepositoryFullNames: ["acme/web"],
        savedRepositoryFullName: "acme/legacy",
      }),
    ).toBe("acme/web");
  });
});

describe("sortJobCatProviderFiles", () => {
  it("sorts files by source path", () => {
    expect(
      sortJobCatProviderFiles([
        { sourcePath: "locales/fr.json" },
        { sourcePath: "locales/en.json" },
      ]).map((file) => file.sourcePath),
    ).toEqual(["locales/en.json", "locales/fr.json"]);
  });
});
