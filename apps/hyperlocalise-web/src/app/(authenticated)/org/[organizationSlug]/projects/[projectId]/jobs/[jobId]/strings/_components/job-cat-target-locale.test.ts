import { describe, expect, it } from "vite-plus/test";

import { selectJobCatTargetLocale } from "./job-cat-target-locale";

describe("selectJobCatTargetLocale", () => {
  it("honors the requested URL target locale when the provider file supports it", () => {
    expect(
      selectJobCatTargetLocale({
        requestedTargetLocale: "fr",
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("fr");
  });

  it("falls back to the first provider target locale when no supported locale is requested", () => {
    expect(
      selectJobCatTargetLocale({
        requestedTargetLocale: null,
        providerTargetLocales: ["de", "fr"],
      }),
    ).toBe("de");
  });
});
