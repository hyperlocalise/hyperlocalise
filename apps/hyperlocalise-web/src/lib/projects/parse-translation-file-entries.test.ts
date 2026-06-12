import { describe, expect, it } from "vite-plus/test";

import { parseTranslationFileEntries } from "@/lib/projects/parse-translation-file-entries";

describe("parseTranslationFileEntries", () => {
  it("flattens nested JSON keys", () => {
    const entries = parseTranslationFileEntries({
      filename: "locales/en.json",
      text: JSON.stringify({
        greeting: "Hello",
        nested: { farewell: "Goodbye" },
      }),
    });

    expect(entries).toEqual([
      { key: "greeting", text: "Hello", context: null, type: "string" },
      { key: "nested.farewell", text: "Goodbye", context: null, type: "string" },
    ]);
  });

  it("parses FormatJS catalogs", () => {
    const entries = parseTranslationFileEntries({
      filename: "messages/en.json",
      text: JSON.stringify({
        welcome: {
          defaultMessage: "Welcome",
          description: "Homepage hero",
        },
      }),
    });

    expect(entries).toEqual([
      {
        key: "welcome",
        text: "Welcome",
        context: "Homepage hero",
        type: "string",
      },
    ]);
  });
});
