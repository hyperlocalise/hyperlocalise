import { describe, expect, it } from "vite-plus/test";

import {
  canLookupFreshCatRepositoryContext,
  selectJobCatRepository,
  sortJobCatProviderFiles,
} from "./select-job-cat-repository";

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

describe("canLookupFreshCatRepositoryContext", () => {
  it("allows fresh lookup when a single repository is enabled", () => {
    expect(canLookupFreshCatRepositoryContext(["acme/web"], null)).toBe(true);
  });

  it("requires an explicit repository choice when multiple repositories are enabled", () => {
    expect(canLookupFreshCatRepositoryContext(["acme/web", "acme/docs"], null)).toBe(false);
    expect(canLookupFreshCatRepositoryContext(["acme/web", "acme/docs"], "acme/docs")).toBe(true);
  });

  it("disables fresh lookup when no repositories are enabled", () => {
    expect(canLookupFreshCatRepositoryContext([], null)).toBe(false);
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
