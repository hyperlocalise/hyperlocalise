import { describe, expect, it } from "vite-plus/test";

import {
  detectContentfulTranslatableFields,
  formatTranslatedValueForContentful,
} from "./field-detector";
import type { ContentfulContentType, ContentfulEntry } from "./types";

const contentType: ContentfulContentType = {
  sys: { id: "helpCenterArticle" },
  fields: [
    { id: "title", name: "Title", type: "Symbol", localized: true },
    { id: "body", name: "Body", type: "RichText", localized: true },
    { id: "slug", name: "Slug", type: "Symbol", localized: true },
    { id: "internalNotes", name: "Internal Notes", type: "Text", localized: false },
  ],
};

const entry: ContentfulEntry = {
  sys: {
    id: "entry-1",
    version: 1,
    contentType: { sys: { id: "helpCenterArticle" } },
  },
  fields: {
    title: {
      "en-US": "Reset your {{productName}} password",
      "fr-FR": "Réinitialisez votre mot de passe",
    },
    body: {
      "en-US": {
        nodeType: "document",
        data: {},
        content: [
          {
            nodeType: "paragraph",
            data: {},
            content: [
              {
                nodeType: "text",
                value: "Visit https://example.com/reset.",
                marks: [],
                data: {},
              },
            ],
          },
        ],
      },
    },
    slug: {
      "en-US": "reset-password",
    },
    internalNotes: {
      "en-US": "Do not translate internal support guidance.",
    },
  },
};

describe("contentful field detector", () => {
  it("detects configured textual fields and skips already-filled targets by default", () => {
    const units = detectContentfulTranslatableFields({
      entry,
      contentType,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: {
        fieldMode: "configured",
        fieldsByContentType: { helpCenterArticle: ["title", "body"] },
      },
    });

    expect(units.map((unit) => unit.fieldId)).toEqual(["body"]);
    expect(units[0]?.sourceText).toContain("https://example.com/reset");
  });

  it("allows overwrite mode for populated target locales", () => {
    const units = detectContentfulTranslatableFields({
      entry,
      contentType,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: {
        fieldMode: "configured",
        fieldsByContentType: { helpCenterArticle: ["title"] },
        overwriteDraftLocales: true,
      },
      overwriteDraftLocales: true,
    });

    expect(units.map((unit) => unit.fieldId)).toEqual(["title"]);
  });

  it("formats tag-like arrays back into Contentful arrays", () => {
    expect(
      formatTranslatedValueForContentful({
        sourceValue: ["one", "two"],
        translatedText: "un, deux",
        valueKind: "array",
      }),
    ).toEqual(["un", "deux"]);
  });
});
