import { describe, expect, it } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import { parseTranslationFileEntries } from "@/lib/projects/files/parse-translation-file-entries";

function expectEntries(
  result: ReturnType<typeof parseTranslationFileEntries>,
  expected: Array<{
    key: string;
    text: string;
    context: string | null;
    type: string;
  }>,
) {
  expect(isOk(result)).toBe(true);
  if (isOk(result)) {
    expect(result.value).toEqual(expected);
  }
}

describe("parseTranslationFileEntries", () => {
  it("flattens nested JSON keys", () => {
    const result = parseTranslationFileEntries({
      filename: "locales/en.json",
      text: JSON.stringify({
        greeting: "Hello",
        nested: { farewell: "Goodbye" },
      }),
    });

    expectEntries(result, [
      { key: "greeting", text: "Hello", context: null, type: "string" },
      { key: "nested.farewell", text: "Goodbye", context: null, type: "string" },
    ]);
  });

  it("parses FormatJS catalogs", () => {
    const result = parseTranslationFileEntries({
      filename: "messages/en.json",
      text: JSON.stringify({
        welcome: {
          defaultMessage: "Welcome",
          description: "Homepage hero",
        },
      }),
    });

    expectEntries(result, [
      {
        key: "welcome",
        text: "Welcome",
        context: "Homepage hero",
        type: "string",
      },
    ]);
  });

  it("preserves FormatJS context when mixed with plain string keys", () => {
    const result = parseTranslationFileEntries({
      filename: "messages/en.json",
      text: JSON.stringify({
        welcome: {
          defaultMessage: "Welcome",
          description: "Homepage hero",
        },
        legacy: "Plain string",
      }),
    });

    expectEntries(result, [
      {
        key: "welcome",
        text: "Welcome",
        context: "Homepage hero",
        type: "string",
      },
      {
        key: "legacy",
        text: "Plain string",
        context: null,
        type: "string",
      },
    ]);
  });

  it("returns ok with an empty list for unsupported extensions", () => {
    const result = parseTranslationFileEntries({
      filename: "locales/en.po",
      text: 'msgid "hello"\nmsgstr "world"',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
    }
  });

  it("returns invalid_json for malformed JSON", () => {
    const result = parseTranslationFileEntries({
      filename: "locales/en.json",
      text: '{"greeting":',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ code: "invalid_json" });
    }
  });

  it("returns invalid_catalog_shape for non-object JSON", () => {
    const result = parseTranslationFileEntries({
      filename: "locales/en.json",
      text: '["not", "a", "catalog"]',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual({ code: "invalid_catalog_shape" });
    }
  });
});
