import { describe, expect, it } from "vite-plus/test";

import { catMessageTokenMissingClass, catMessageTokenToneClass } from "./cat-message-token-styles";

describe("catMessageTokenToneClass", () => {
  it("uses readable foreground tokens for ICU highlights in both themes", () => {
    const classes = catMessageTokenToneClass("icu").split(" ");

    expect(classes).toContain("text-bud-900");
    expect(classes).toContain("dark:text-bud-300");
    expect(classes).not.toContain("text-bud-100");
  });

  it("uses readable foreground tokens for placeholder highlights in both themes", () => {
    const classes = catMessageTokenToneClass("placeholder").split(" ");

    expect(classes).toContain("text-dew-900");
    expect(classes).toContain("dark:text-dew-100");
    expect(classes).not.toContain("text-dew-100");
  });

  it("uses readable foreground tokens for pound highlights in both themes", () => {
    const classes = catMessageTokenToneClass("pound").split(" ");

    expect(classes).toContain("text-grove-900");
    expect(classes).toContain("dark:text-grove-300");
    expect(classes).not.toContain("text-grove-100");
  });

  it("styles tag highlights with semantic border and foreground tokens", () => {
    const classes = catMessageTokenToneClass("tag").split(" ");

    expect(classes).toContain("border-border");
    expect(classes).toContain("bg-skeleton");
    expect(classes).toContain("text-foreground");
  });

  it("styles error highlights with rounded corners and theme-aware flame tokens", () => {
    const classes = catMessageTokenToneClass("error").split(" ");

    expect(classes).toContain("rounded-md");
    expect(classes).toContain("bg-flame-700/20");
    expect(classes).toContain("text-flame-900");
    expect(classes).toContain("dark:text-flame-100");
    expect(classes).not.toContain("text-flame-100");
  });
});

describe("catMessageTokenMissingClass", () => {
  it("uses readable foreground tokens for missing ICU tokens", () => {
    const classes = catMessageTokenMissingClass.split(" ");

    expect(classes).toContain("text-bud-900");
    expect(classes).toContain("dark:text-bud-300");
    expect(classes).not.toContain("text-bud-100");
  });
});
