import { describe, expect, it } from "vite-plus/test";

import { externalTmsTranslationPushBodySchema } from "./project.schema";

describe("externalTmsTranslationPushBodySchema", () => {
  it("requires either key or externalStringId on each translation", () => {
    const result = externalTmsTranslationPushBodySchema.safeParse({
      externalJobId: "2001",
      translations: [{ locale: "fr", text: "Bonjour" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Either key or externalStringId must be provided",
      );
    }
  });

  it("accepts translations identified by key", () => {
    const result = externalTmsTranslationPushBodySchema.safeParse({
      externalJobId: "2001",
      translations: [{ locale: "fr", text: "Bonjour", key: "hello" }],
    });

    expect(result.success).toBe(true);
  });

  it("accepts translations identified by externalStringId", () => {
    const result = externalTmsTranslationPushBodySchema.safeParse({
      externalJobId: "2001",
      translations: [{ locale: "fr", text: "Bonjour", externalStringId: "1001" }],
    });

    expect(result.success).toBe(true);
  });
});
