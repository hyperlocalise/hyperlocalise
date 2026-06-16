import { describe, expect, it } from "vite-plus/test";

import {
  collectRichTextEmbeddedAssetIds,
  detectContentfulTranslatableFields,
  formatTranslatedValueForContentful,
  replaceRichTextEmbeddedAssetIds,
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
    expect(units[0]?.kind === "text" ? units[0].sourceText : "").toContain(
      "https://example.com/reset",
    );
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
    expect(units[0]?.kind === "text" ? units[0].existingTranslations : []).toEqual([]);
  });

  it("skips non-localized fields even when explicitly configured", () => {
    const units = detectContentfulTranslatableFields({
      entry,
      contentType,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: {
        fieldMode: "configured",
        fieldsByContentType: { helpCenterArticle: ["internalNotes"] },
      },
    });

    expect(units).toEqual([]);
  });

  it("resolves language-only source locales against regional entry locales", () => {
    const units = detectContentfulTranslatableFields({
      entry: {
        sys: {
          id: "1a5gC3DK3qscb3ngqj1hki",
          version: 1,
          contentType: { sys: { id: "helpDeskArticle" } },
        },
        fields: {
          title: {
            "en-US": "How to create translation",
          },
          content: {
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
                      value: "Here is an example of translation",
                      marks: [],
                      data: {},
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      contentType: {
        sys: { id: "helpDeskArticle" },
        fields: [
          { id: "title", name: "Title", type: "Symbol", localized: true },
          { id: "content", name: "Content", type: "RichText", localized: true },
        ],
      },
      sourceLocale: "en",
      targetLocales: ["fr"],
      fieldConfig: { fieldMode: "auto" },
      defaultLocale: "en-US",
    });

    expect(units.map((unit) => unit.fieldId)).toEqual(["title", "content"]);
    expect(units.every((unit) => unit.sourceLocale === "en-US")).toBe(true);
  });

  it("formats tag-like arrays back into Contentful arrays", () => {
    expect(
      formatTranslatedValueForContentful({
        sourceValue: ["one", "two"],
        translatedText: JSON.stringify(["un", "deux"]),
        valueKind: "array",
      }),
    ).toEqual(["un", "deux"]);
  });

  it("does not split translated array items on commas", () => {
    expect(
      formatTranslatedValueForContentful({
        sourceValue: ["Machine learning type I"],
        translatedText: JSON.stringify(["Maschinelles Lernen, Typ I"]),
        valueKind: "array",
      }),
    ).toEqual(["Maschinelles Lernen, Typ I"]);
  });

  it("formats rich text translations across existing text nodes", () => {
    const sourceValue = {
      nodeType: "document",
      data: {},
      content: [
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "First paragraph.", marks: [], data: {} }],
        },
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "Second paragraph.", marks: [], data: {} }],
        },
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "Third paragraph.", marks: [], data: {} }],
        },
      ],
    };

    const formatted = formatTranslatedValueForContentful({
      sourceValue,
      translatedText: JSON.stringify([
        "Premier paragraphe.",
        "Deuxième paragraphe.",
        "Troisième paragraphe.",
      ]),
      valueKind: "rich_text",
    });

    expect(formatted).toMatchObject({
      content: [
        { content: [{ value: "Premier paragraphe." }] },
        { content: [{ value: "Deuxième paragraphe." }] },
        { content: [{ value: "Troisième paragraphe." }] },
      ],
    });
  });

  it("keeps empty rich-text nodes structural instead of translating them", () => {
    const sourceValue = {
      nodeType: "document",
      data: {},
      content: [
        {
          nodeType: "paragraph",
          data: {},
          content: [
            {
              nodeType: "text",
              value:
                "A peaceful walk through the park as the sun rises, with birds singing and fresh air setting a calm mood for the day.",
              marks: [],
              data: {},
            },
          ],
        },
        {
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: { type: "Link", linkType: "Asset", id: "asset-inline" },
            },
          },
          content: [],
        },
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "", marks: [], data: {} }],
        },
      ],
    };

    const units = detectContentfulTranslatableFields({
      entry: {
        sys: {
          id: "entry-1",
          version: 1,
          contentType: { sys: { id: "helpCenterArticle" } },
        },
        fields: {
          content: {
            "en-US": sourceValue,
          },
        },
      },
      contentType: {
        sys: { id: "helpCenterArticle" },
        fields: [{ id: "content", name: "Content", type: "RichText", localized: true }],
      },
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: { fieldMode: "auto" },
    });

    expect(units[0]?.kind === "text" ? units[0].sourceText : "").toBe(
      JSON.stringify([
        "A peaceful walk through the park as the sun rises, with birds singing and fresh air setting a calm mood for the day.",
      ]),
    );

    const formatted = formatTranslatedValueForContentful({
      sourceValue,
      translatedText: JSON.stringify(["Une promenade paisible dans le parc au lever du soleil."]),
      valueKind: "rich_text",
    });

    expect(formatted).toMatchObject({
      content: [
        {
          content: [{ value: "Une promenade paisible dans le parc au lever du soleil." }],
        },
        {
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: { type: "Link", linkType: "Asset", id: "asset-inline" },
            },
          },
        },
        {
          content: [{ value: "" }],
        },
      ],
    });
  });

  it("detects localized asset link fields for image translation", () => {
    const imageContentType: ContentfulContentType = {
      sys: { id: "marketingPage" },
      fields: [
        { id: "heroImage", name: "Hero Image", type: "Link", linkType: "Asset", localized: true },
        { id: "title", name: "Title", type: "Symbol", localized: true },
      ],
    };
    const imageEntry: ContentfulEntry = {
      sys: {
        id: "entry-2",
        version: 1,
        contentType: { sys: { id: "marketingPage" } },
      },
      fields: {
        heroImage: {
          "en-US": {
            sys: { type: "Link", linkType: "Asset", id: "asset-source" },
          },
        },
        title: {
          "en-US": "Launch campaign",
        },
      },
    };

    const units = detectContentfulTranslatableFields({
      entry: imageEntry,
      contentType: imageContentType,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: { fieldMode: "auto" },
    });

    expect(units).toHaveLength(2);
    expect(units.find((unit) => unit.kind === "image")?.fieldId).toBe("heroImage");
    expect(units.find((unit) => unit.kind === "text")?.fieldId).toBe("title");
  });

  it("does not detect localized asset arrays as image units", () => {
    const imageContentType: ContentfulContentType = {
      sys: { id: "marketingPage" },
      fields: [
        {
          id: "gallery",
          name: "Gallery",
          type: "Array",
          localized: true,
          items: { type: "Link", linkType: "Asset" },
        },
      ],
    };
    const imageEntry: ContentfulEntry = {
      sys: {
        id: "entry-2",
        version: 1,
        contentType: { sys: { id: "marketingPage" } },
      },
      fields: {
        gallery: {
          "en-US": [{ sys: { type: "Link", linkType: "Asset", id: "asset-source" } }],
        },
      },
    };

    const units = detectContentfulTranslatableFields({
      entry: imageEntry,
      contentType: imageContentType,
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      fieldConfig: { fieldMode: "auto" },
    });

    expect(units).toEqual([]);
  });

  it("collects embedded asset ids from rich text and replaces them during writeback", () => {
    const richTextValue = {
      nodeType: "document",
      data: {},
      content: [
        {
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: { type: "Link", linkType: "Asset", id: "asset-inline" },
            },
          },
          content: [],
        },
        {
          nodeType: "paragraph",
          data: {},
          content: [{ nodeType: "text", value: "Caption text.", marks: [], data: {} }],
        },
      ],
    };

    expect(collectRichTextEmbeddedAssetIds(richTextValue)).toEqual(["asset-inline"]);

    const replaced = replaceRichTextEmbeddedAssetIds(
      richTextValue,
      new Map([["asset-inline", "asset-localized"]]),
    ) as { content: Array<Record<string, unknown>> };

    expect(replaced.content[0]).toMatchObject({
      nodeType: "embedded-asset-block",
      data: {
        target: {
          sys: { type: "Link", linkType: "Asset", id: "asset-localized" },
        },
      },
    });

    const formatted = formatTranslatedValueForContentful({
      sourceValue: richTextValue,
      translatedText: JSON.stringify(["Texte de légende."]),
      valueKind: "rich_text",
      localizedAssetIdsBySourceId: new Map([["asset-inline", "asset-localized"]]),
    });

    expect(formatted).toMatchObject({
      content: [
        {
          nodeType: "embedded-asset-block",
          data: {
            target: {
              sys: { type: "Link", linkType: "Asset", id: "asset-localized" },
            },
          },
        },
        {
          content: [{ value: "Texte de légende." }],
        },
      ],
    });
  });
});
