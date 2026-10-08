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

import { serializeIntercomArticleMarkdown } from "./article-markdown";
import { INTERCOM_ARTICLE_BODY_MARKDOWN } from "./intercom-article-markdown.fixture";
import {
  applyApprovedKeyedUnitsToMarkdown,
  composeIntercomArticleFromApprovedKeyedUnits,
} from "./keyed-article-compose";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";

const SOURCE_MARKDOWN = serializeIntercomArticleMarkdown({
  title: "Your first public article",
  description: "Some resources to help you understand how Articles can be used",
  body: INTERCOM_ARTICLE_BODY_MARKDOWN,
});

describe("composeIntercomArticleFromApprovedKeyedUnits", () => {
  it("rebuilds title, description, and body from approved CAT keys", () => {
    const composed = composeIntercomArticleFromApprovedKeyedUnits({
      sourceMarkdown: SOURCE_MARKDOWN,
      units: [
        {
          key: "md.frontmatter/title",
          sourceText: "Your first public article",
          targetText: "Dein erster öffentlicher Artikel",
        },
        {
          key: "md.frontmatter/description",
          sourceText: "Some resources to help you understand how Articles can be used",
          targetText:
            "Einige Ressourcen, die helfen zu verstehen, wie Artikel verwendet werden können",
        },
        {
          key: "md.Heading[0]/line[0]",
          sourceText: "Build a comprehensive knowledge base {#h_61bff2dd7a}",
          targetText: "Eine umfassende Wissensdatenbank aufbauen {#h_61bff2dd7a}",
        },
      ],
    });

    expect(composed).toEqual({
      title: "Dein erster öffentlicher Artikel",
      description:
        "Einige Ressourcen, die helfen zu verstehen, wie Artikel verwendet werden können",
      body: INTERCOM_ARTICLE_BODY_MARKDOWN.replace(
        "Build a comprehensive knowledge base {#h_61bff2dd7a}",
        "Eine umfassende Wissensdatenbank aufbauen {#h_61bff2dd7a}",
      ),
    });
  });

  it("expands markdown link placeholders so Intercom still receives real links", () => {
    const composed = composeIntercomArticleFromApprovedKeyedUnits({
      sourceMarkdown: SOURCE_MARKDOWN,
      units: [
        {
          key: "md.frontmatter/title",
          sourceText: "Your first public article",
          targetText: "Dein erster öffentlicher Artikel",
        },
        {
          key: "md.Paragraph[0]/line[1]",
          sourceText: `Teammates can also insert articles in Help Desk conversations, send them in Proactive Support messages, and use them to power the ${md0}Fin AI Agent${md1} 💪`,
          targetText: `Teammates können Artikel auch in Help-Desk-Unterhaltungen einfügen, in Proactive-Support-Nachrichten senden und damit den ${md0}Fin KI-Agenten${md1} 💪`,
        },
      ],
    });

    expect(composed?.title).toBe("Dein erster öffentlicher Artikel");
    expect(composed?.body).toContain(
      "und damit den [Fin KI-Agenten](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained) 💪",
    );
    expect(composed?.body).not.toContain("HLMDPH");
  });

  it("keeps approved titles that contain JSON escape sequences", () => {
    const composed = composeIntercomArticleFromApprovedKeyedUnits({
      sourceMarkdown: SOURCE_MARKDOWN,
      units: [
        {
          key: "md.frontmatter/title",
          sourceText: "Your first public article",
          targetText: String.raw`C:\temp`,
        },
        {
          key: "md.frontmatter/description",
          sourceText: "Some resources to help you understand how Articles can be used",
          targetText: String.raw`Line 1\nLine 2`,
        },
      ],
    });

    expect(composed?.title).toBe(String.raw`C:\temp`);
    expect(composed?.description).toBe(String.raw`Line 1\nLine 2`);
    expect(composed?.body).toBe(INTERCOM_ARTICLE_BODY_MARKDOWN);
  });

  it("returns null when the approved title key is missing", () => {
    expect(
      composeIntercomArticleFromApprovedKeyedUnits({
        sourceMarkdown: SOURCE_MARKDOWN,
        units: [
          {
            key: "md.Heading[0]/line[0]",
            sourceText: "Build a comprehensive knowledge base {#h_61bff2dd7a}",
            targetText: "Eine umfassende Wissensdatenbank aufbauen {#h_61bff2dd7a}",
          },
        ],
      }),
    ).toBeNull();
  });

  it("ignores Intercom callout fence units when composing", () => {
    const composed = composeIntercomArticleFromApprovedKeyedUnits({
      sourceMarkdown: SOURCE_MARKDOWN,
      units: [
        {
          key: "md.frontmatter/title",
          sourceText: "Your first public article",
          targetText: "Dein erster öffentlicher Artikel",
        },
        {
          key: "md.Paragraph[4]/line[0]",
          sourceText: ':::callout backgroundColor="#feedaf80"\nborderColor="#fbc91633"',
          targetText: ':::callout backgroundColor="#feedaf80"\nborderColor="#fbc91633"',
        },
      ],
    });

    expect(composed?.title).toBe("Dein erster öffentlicher Artikel");
    expect(composed?.body).toContain(':::callout backgroundColor="#feedaf80"');
  });

  it("returns null when no visible keys are approved", () => {
    expect(
      composeIntercomArticleFromApprovedKeyedUnits({
        sourceMarkdown: SOURCE_MARKDOWN,
        units: [],
      }),
    ).toBeNull();
  });
});

describe("applyApprovedKeyedUnitsToMarkdown", () => {
  it("replaces the earliest occurrence when the same source text appears twice", () => {
    const markdown = "Hello title\n\n# Hello title\n";
    expect(
      applyApprovedKeyedUnitsToMarkdown(markdown, [
        { key: "md.frontmatter/title", sourceText: "Hello title", targetText: "Hallo Titel" },
        {
          key: "md.Heading[0]/line[0]",
          sourceText: "Hello title",
          targetText: "Hallo Überschrift",
        },
      ]),
    ).toBe("Hallo Titel\n\n# Hallo Überschrift\n");
  });

  it("places later paragraph keys on later identical source text", () => {
    const markdown = "Hello title\n\nHello again\n\nHello again\n";
    expect(
      applyApprovedKeyedUnitsToMarkdown(markdown, [
        {
          key: "md.Paragraph[10]/line[0]",
          sourceText: "Hello again",
          targetText: "Zehnter Absatz",
        },
        {
          key: "md.Paragraph[2]/line[0]",
          sourceText: "Hello again",
          targetText: "Zweiter Absatz",
        },
        { key: "md.frontmatter/title", sourceText: "Hello title", targetText: "Hallo Titel" },
      ]),
    ).toBe("Hallo Titel\n\nZweiter Absatz\n\nZehnter Absatz\n");
  });

  it("returns null when a keyed source segment is not in the markdown", () => {
    expect(
      applyApprovedKeyedUnitsToMarkdown("# Hello\n", [
        { key: "md.Heading[0]/line[0]", sourceText: "Missing", targetText: "Fehlt" },
      ]),
    ).toBeNull();
  });
});
