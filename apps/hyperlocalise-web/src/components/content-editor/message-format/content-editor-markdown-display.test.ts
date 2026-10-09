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

import { analyzeCatMessageFormat } from "./content-editor-message-format";
import {
  canUseMarkdownCatEditor,
  isStructuralMarkdownMarkupToken,
  markdownDisplayDocFromModel,
  markdownDisplayModel,
  persistMarkdownCatTarget,
  serializeMarkdownDisplaySpans,
  serializeMarkdownEditorDoc,
  sourceHeadingIdLiteral,
} from "./content-editor-markdown-display";
import {
  formatMarkdownMarkupForDisplay,
  recoverMarkdownMarkupTokens,
} from "./content-editor-markdown-markup";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
const md2 = "\u001eHLMDPH_AAAAAAAAAAAA_2\u001f";
const md3 = "\u001eHLMDPH_BBBBBBBBBBBB_3\u001f";

const HELP_CENTER_URL =
  "https://www.intercom.com/help/en/articles/56644-customize-your-help-center";
const MULTI_HELP_URL =
  "https://www.intercom.com/help/en/articles/8170953-create-and-manage-multiple-help-centers";

describe("markdownDisplayModel", () => {
  it("hides Intercom heading ids and keeps the heading copy", () => {
    const source = `Use Articles to power Fin AI Agent and Fin AI Copilot ${md0}`;
    const target = "Nutzen Sie Articles als Grundlage {#h_8b76258d80}";

    const model = markdownDisplayModel(source, target);

    expect(model.headingId).toBe("h_8b76258d80");
    expect(model.visibleText).toBe("Use Articles to power Fin AI Agent and Fin AI Copilot");
    expect(model.spans).toEqual([
      { type: "text", text: "Use Articles to power Fin AI Agent and Fin AI Copilot" },
    ]);
  });

  it("splits two Intercom help-center links into visual link spans", () => {
    const source = `${md0}Customize your Help Center to match your branding${md1} or use ${md2}Multi Help Center${md3} for various products/brands.`;
    const target = `[Passen Sie ihr Help Center an Ihre Marke an](${HELP_CENTER_URL}) oder nutzen Sie [Multi Help Center](${MULTI_HELP_URL}) für verschiedene Produkte/Marken.`;

    const model = markdownDisplayModel(source, target);

    expect(model.headingId).toBeNull();
    expect(model.spans).toEqual([
      {
        type: "link",
        label: "Customize your Help Center to match your branding",
        href: HELP_CENTER_URL,
        image: false,
      },
      { type: "text", text: " or use " },
      {
        type: "link",
        label: "Multi Help Center",
        href: MULTI_HELP_URL,
        image: false,
      },
      { type: "text", text: " for various products/brands." },
    ]);
  });

  it("expands dual-sentinel Fin callout links for display", () => {
    const HELP_CENTER_FIN_URL =
      "https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center";
    const COLLECTION_FIN_URL =
      "https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center";
    const sourceTemplate = `For a public article to be enabled for Fin, it must be published, part of a live ${md0}Help Center${md1} and in a ${md2}collection.${md3}`;
    const englishRaw = `For a public article to be enabled for Fin, it must be published, part of a live [Help Center](${HELP_CENTER_FIN_URL}) and in a [collection.](${COLLECTION_FIN_URL})`;
    const germanRaw = `Damit ein öffentlicher Artikel für Fin aktiviert werden kann, muss er veröffentlicht, Teil eines aktiven [Hilfe-Centers](${HELP_CENTER_FIN_URL}) und in einer [Sammlung](${COLLECTION_FIN_URL}) sein.`;
    const sourceProtected = recoverMarkdownMarkupTokens(sourceTemplate, englishRaw);
    const targetProtected = recoverMarkdownMarkupTokens(sourceTemplate, germanRaw);
    expect(sourceProtected).toBeTruthy();
    expect(targetProtected).toBeTruthy();

    const model = markdownDisplayModel(targetProtected!, sourceProtected!, {
      sourceMarkdown: englishRaw,
    });

    expect(model.spans.filter((span) => span.type === "link")).toEqual([
      {
        type: "link",
        label: "Hilfe-Centers",
        href: HELP_CENTER_FIN_URL,
        image: false,
      },
      {
        type: "link",
        label: "Sammlung",
        href: COLLECTION_FIN_URL,
        image: false,
      },
    ]);
    expect(
      formatMarkdownMarkupForDisplay(targetProtected!, sourceProtected!, {
        sourceMarkdown: englishRaw,
      }),
    ).toBe(germanRaw);
    expect(canUseMarkdownCatEditor(targetProtected!, sourceProtected!)).toBe(true);
  });

  it("parses raw markdown links without sentinels", () => {
    const model = markdownDisplayModel(
      `[Customize your Help Center](${HELP_CENTER_URL}) or use [Multi Help Center](${MULTI_HELP_URL}).`,
    );

    expect(model.spans.filter((span) => span.type === "link")).toEqual([
      {
        type: "link",
        label: "Customize your Help Center",
        href: HELP_CENTER_URL,
        image: false,
      },
      {
        type: "link",
        label: "Multi Help Center",
        href: MULTI_HELP_URL,
        image: false,
      },
    ]);
  });
});

describe("persistMarkdownCatTarget", () => {
  it("round-trips a heading id back to the source sentinel", () => {
    const source = `Use Articles to power Fin AI Agent and Fin AI Copilot ${md0}`;
    const heading = sourceHeadingIdLiteral(source, "copy {#h_8b76258d80}");

    expect(heading).toBe("{#h_8b76258d80}");
    expect(persistMarkdownCatTarget(source, "Nutzen Sie Articles als Grundlage", heading)).toBe(
      `Nutzen Sie Articles als Grundlage ${md0}`,
    );
  });

  it("round-trips two visual links back to source sentinels", () => {
    const source = `${md0}Customize your Help Center to match your branding${md1} or use ${md2}Multi Help Center${md3} for various products/brands.`;
    const serialized = serializeMarkdownDisplaySpans([
      {
        type: "link",
        label: "Passen Sie ihr Help Center an Ihre Marke an",
        href: HELP_CENTER_URL,
        image: false,
      },
      { type: "text", text: " oder nutzen Sie " },
      {
        type: "link",
        label: "Multi Help Center",
        href: MULTI_HELP_URL,
        image: false,
      },
      { type: "text", text: " für verschiedene Produkte/Marken." },
    ]);

    expect(persistMarkdownCatTarget(source, serialized)).toBe(
      `${md0}Passen Sie ihr Help Center an Ihre Marke an${md1} oder nutzen Sie ${md2}Multi Help Center${md3} für verschiedene Produkte/Marken.`,
    );
  });
});

describe("serializeMarkdownEditorDoc", () => {
  it("serializes visual link marks back to markdown", () => {
    const model = markdownDisplayModel(`[Customize your Help Center](${HELP_CENTER_URL})`);

    expect(serializeMarkdownEditorDoc(markdownDisplayDocFromModel(model))).toBe(
      `[Customize your Help Center](${HELP_CENTER_URL})`,
    );
  });

  it("serializes hard breaks as newlines", () => {
    expect(
      serializeMarkdownEditorDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Line one" },
              { type: "hardBreak" },
              { type: "text", text: "Line two" },
            ],
          },
        ],
      }),
    ).toBe("Line one\nLine two");
  });
});

describe("isStructuralMarkdownMarkupToken", () => {
  it("treats link and heading-id MD tokens as structural", () => {
    const source = `Visit ${md0}Help Center${md1} {#h_8b76258d80}`;
    const target = `Besuchen Sie [Hilfe-Center](${HELP_CENTER_URL}) {#h_8b76258d80}`;
    const tokens = analyzeCatMessageFormat(source).tokens.filter(
      (token) => token.kind === "markup",
    );

    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => isStructuralMarkdownMarkupToken(token, source, target))).toBe(
      true,
    );
  });

  it("does not treat ICU tokens as structural markdown", () => {
    const token = analyzeCatMessageFormat("Hello {name}").tokens[0]!;
    expect(isStructuralMarkdownMarkupToken(token, "Hello {name}")).toBe(false);
  });
});
