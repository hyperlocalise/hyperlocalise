import { describe, expect, it } from "vite-plus/test";

import { defaultSelectedLocale, localeLabel, translateToOptionsForProject } from "./locale-label";

describe("localeLabel", () => {
  it("formats BCP 47 tags for display", () => {
    expect(localeLabel("en")).toBe("English (en)");
    expect(localeLabel("es")).toBe("Spanish (es)");
  });

  it("defaults selected locale to source then keeps a valid current value", () => {
    expect(
      defaultSelectedLocale(
        { id: "p1", name: "P", sourceLocale: "en", targetLocales: ["es", "fr"] },
        "",
      ),
    ).toBe("en");
    expect(
      defaultSelectedLocale(
        { id: "p1", name: "P", sourceLocale: "en", targetLocales: ["es", "fr"] },
        "fr",
      ),
    ).toBe("fr");
  });

  it("lists source locale before targets in translate options", () => {
    expect(
      translateToOptionsForProject({
        id: "p1",
        name: "P",
        sourceLocale: "en",
        targetLocales: ["es", "en", "fr"],
      }).map((option) => option.value),
    ).toEqual(["en", "es", "fr"]);
  });
});
