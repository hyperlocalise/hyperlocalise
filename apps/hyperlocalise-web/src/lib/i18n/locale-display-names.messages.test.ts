import { describe, expect, it } from "vite-plus/test";
import { createIntl } from "@formatjs/intl";

import {
  commonLocaleDisplayNameMessages,
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
  getCommonLocaleDisplayNameMessage,
} from "./locale-display-names.messages";
import { COMMON_LOCALES } from "./locales";

describe("locale-display-names.messages", () => {
  const intl = createIntl({ locale: "en", messages: {} });

  it("defines a message for every common locale", () => {
    for (const locale of COMMON_LOCALES) {
      expect(getCommonLocaleDisplayNameMessage(locale)).toBeDefined();
    }
    expect(Object.keys(commonLocaleDisplayNameMessages)).toHaveLength(COMMON_LOCALES.length);
  });

  it("formats known locales via defineMessages and appends the code", () => {
    expect(formatLocaleDisplayName(intl, "fr-FR")).toBe("French (France)");
    expect(formatLocaleOptionLabel(intl, "fr-FR")).toBe("French (France) (fr-FR)");
    expect(formatLocaleOptionLabel(intl, "en")).toBe("English (en)");
  });

  it("falls back to Intl.DisplayNames for unknown BCP-47 tags", () => {
    expect(formatLocaleDisplayName(intl, "sw-KE")).toContain("Swahili");
    expect(formatLocaleOptionLabel(intl, "sw-KE")).toMatch(/\(sw-KE\)$/);
  });

  it("formats language-only tags like provider locale ids", () => {
    expect(formatLocaleDisplayName(intl, "vi")).toBe("Vietnamese");
    expect(formatLocaleOptionLabel(intl, "vi")).toBe("Vietnamese (vi)");
  });
});
