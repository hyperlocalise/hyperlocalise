import { describe, expect, it } from "vite-plus/test";

import { catMessageTokenMissingClass, catMessageTokenToneClass } from "./cat-message-token-styles";

describe("catMessageTokenToneClass", () => {
  it("uses readable foreground tokens for ICU highlights in both themes", () => {
    expect(catMessageTokenToneClass("icu")).toContain("text-bud-900");
    expect(catMessageTokenToneClass("icu")).toContain("dark:text-bud-300");
    expect(catMessageTokenToneClass("icu")).not.toContain("text-bud-100");
  });

  it("uses readable foreground tokens for placeholder highlights in both themes", () => {
    expect(catMessageTokenToneClass("placeholder")).toContain("text-dew-900");
    expect(catMessageTokenToneClass("placeholder")).toContain("dark:text-dew-100");
    expect(catMessageTokenToneClass("placeholder")).not.toContain("text-dew-100 ");
  });

  it("uses readable foreground tokens for pound highlights in both themes", () => {
    expect(catMessageTokenToneClass("pound")).toContain("text-grove-900");
    expect(catMessageTokenToneClass("pound")).toContain("dark:text-grove-300");
    expect(catMessageTokenToneClass("pound")).not.toContain("text-grove-100");
  });
});

describe("catMessageTokenMissingClass", () => {
  it("uses readable foreground tokens for missing ICU tokens", () => {
    expect(catMessageTokenMissingClass).toContain("text-bud-900");
    expect(catMessageTokenMissingClass).toContain("dark:text-bud-300");
    expect(catMessageTokenMissingClass).not.toContain("text-bud-100");
  });
});
