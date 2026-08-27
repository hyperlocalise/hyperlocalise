/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  externalTmsTranslationPushBodySchema,
  projectFileCatMaxLengthBodySchema,
} from "./project.schema";

describe("projectFileCatMaxLengthBodySchema", () => {
  it("accepts a positive maxLength", () => {
    const result = projectFileCatMaxLengthBodySchema.safeParse({
      sourcePath: "locales/en.json",
      externalStringId: "1001",
      maxLength: 24,
    });

    expect(result.success).toBe(true);
  });

  it("accepts null to clear maxLength", () => {
    const result = projectFileCatMaxLengthBodySchema.safeParse({
      sourcePath: "locales/en.json",
      externalStringId: "1001",
      maxLength: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero, negative, non-integer, and over-max maxLength values", () => {
    for (const maxLength of [0, -1, 1.5, 100_001]) {
      const result = projectFileCatMaxLengthBodySchema.safeParse({
        sourcePath: "locales/en.json",
        externalStringId: "1001",
        maxLength,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects blank sourcePath or externalStringId", () => {
    expect(
      projectFileCatMaxLengthBodySchema.safeParse({
        sourcePath: " ",
        externalStringId: "1001",
        maxLength: 10,
      }).success,
    ).toBe(false);
    expect(
      projectFileCatMaxLengthBodySchema.safeParse({
        sourcePath: "locales/en.json",
        externalStringId: " ",
        maxLength: 10,
      }).success,
    ).toBe(false);
  });
});

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
