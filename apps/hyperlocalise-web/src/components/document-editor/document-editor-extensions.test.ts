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
// @vitest-environment happy-dom
import { Editor, type JSONContent } from "@tiptap/core";
import { marked } from "marked";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { INTERCOM_ARTICLE_BODY_MARKDOWN } from "@/lib/intercom/intercom-article-markdown.fixture";

import {
  createDocumentSchemaExtensions,
  isLossyDocumentRoundTrip,
  normalizeDocumentMarkdown,
  normalizeGfmTablesInMarkdown,
  parseDocumentMarkdown,
  type DocumentEditorSyntax,
} from "./document-editor-extensions";
import { readJsxStringProps, writeJsxStringProp } from "./document-editor-mdx-syntax";

const MDX_FIXTURE = `import { Foo } from "./foo";

# Hello

Some <Tooltip tip="hi">text</Tooltip> here and {props.count} items.

<Callout type="warning" title="Careful">
  Body with **bold**.

  - item
</Callout>

<Card title="A" href={links.a} />

<Badge>New</Badge>

<Tabs>
  <Tab title="One">
    First tab.
  </Tab>
</Tabs>

> [!NOTE]
> Useful info.
>
> Second para.

{/* comment */}`;

const MARKDOWN_FIXTURE = `# Guide

Intro with a [link](https://example.com) and \`code\`.

> [!WARNING]
> Mind the gap.

\`\`\`ts


const spaced = true;
\`\`\`

- one
- two`;

const GFM_TABLE_FIXTURE = `## Comparison

| Platform | Best for | Main strength |
| -------- | -------- | ------------- |
| **Hyperlocalise** | Product teams | AI agents and review |
| **Crowdin** | Developer-led teams | Integrations and APIs |`;

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function jsonText(node: JSONContent | undefined): string {
  if (!node) {
    return "";
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  return (node.content ?? []).map(jsonText).join("");
}

function roundTrip(markdown: string, syntax: DocumentEditorSyntax) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createDocumentSchemaExtensions(syntax),
    content: markdown,
    contentType: "markdown",
  });
  return normalizeDocumentMarkdown(editor.getMarkdown());
}

describe("document Markdown round trip", () => {
  it("keeps an unedited MDX document as written", () => {
    expect(roundTrip(MDX_FIXTURE, "mdx")).toBe(MDX_FIXTURE);
  });

  it("keeps an unedited Markdown document as written", () => {
    expect(roundTrip(MARKDOWN_FIXTURE, "markdown")).toBe(MARKDOWN_FIXTURE);
  });

  it("round-trips formatted headings and GitHub callouts without Intercom syntax", () => {
    const source = `## Hello **world** and [docs](https://example.com)

> [!NOTE]
> Keep this note.

See {name} in the heading {#not-an-id-here}.`;

    const serialized = roundTrip(source, "markdown");
    expect(serialized).toContain("## Hello **world** and [docs](https://example.com)");
    expect(serialized).toContain("> [!NOTE]");
    expect(serialized).not.toContain(":::callout");
    expect(serialized).toContain("See {name} in the heading {#not-an-id-here}.");

    const heading = parseDocumentMarkdown(source, "markdown").content?.find(
      (node) => node.type === "heading",
    );
    expect(heading?.attrs?.id ?? null).toBeNull();
    expect(jsonText(heading)).toBe("Hello world and docs");
  });

  it("drops raw HTML wrappers from Markdown documents", () => {
    expect(roundTrip('# T\n\n<div class="x">keep</div>\n', "markdown")).toBe("# T\n\nkeep");
  });

  it("parses GFM tables into a table block", () => {
    const doc = parseDocumentMarkdown(GFM_TABLE_FIXTURE, "markdown");
    const types = doc.content?.map((node) => node.type);

    expect(types).toEqual(["heading", "table"]);
  });

  it("round-trips GFM tables without forcing lossy code mode", () => {
    const normalized = roundTrip(GFM_TABLE_FIXTURE, "markdown");

    expect(isLossyDocumentRoundTrip("markdown", GFM_TABLE_FIXTURE, normalized)).toBe(false);
    expect(normalized).toMatch(/\| Platform\s+\|/);
    expect(normalized).toContain("**Hyperlocalise**");
  });

  it("reads MDX into component, raw, and callout blocks", () => {
    const types = parseDocumentMarkdown(MDX_FIXTURE, "mdx").content?.map((node) => node.type);

    expect(types).toEqual([
      "mdxRaw",
      "heading",
      "paragraph",
      "mdxComponent",
      "mdxRaw",
      "mdxComponent",
      "mdxComponent",
      "callout",
      "mdxRaw",
    ]);
  });

  it("hides Intercom heading ids and keeps the real article body", () => {
    const doc = parseDocumentMarkdown(INTERCOM_ARTICLE_BODY_MARKDOWN, "markdown");
    const headings = (doc.content ?? [])
      .filter((node) => node.type === "heading")
      .map((node) => ({
        level: node.attrs?.level,
        id: node.attrs?.id,
        text: jsonText(node),
      }));

    expect(headings).toEqual([
      { level: 1, id: "h_61bff2dd7a", text: "Build a comprehensive knowledge base" },
      {
        level: 3,
        id: "h_bb4813e5c6",
        text: "To make your content easy to find, you need to:",
      },
      {
        level: 1,
        id: "h_8b76258d80",
        text: "Use Articles to power Fin AI Agent and Fin AI Copilot",
      },
    ]);
    expect(jsonText(doc)).toContain("To make your content easy to find, you need to:");
    expect(jsonText(doc)).not.toContain("{#h_");
    expect(jsonText(doc)).toContain("part of a live Help Center and in a collection.");
  });

  it("round-trips Intercom body_markdown for draft push", () => {
    const serialized = roundTrip(INTERCOM_ARTICLE_BODY_MARKDOWN, "markdown");
    expect(serialized).toContain("{#h_61bff2dd7a}");
    expect(serialized).toContain("{#h_bb4813e5c6}");
    expect(serialized).toContain("{#h_8b76258d80}");
    expect(serialized).toContain(':::callout backgroundColor="#feedaf80" borderColor="#fbc91633"');
    expect(serialized).toContain(
      "[collection.](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center)",
    );
    expect(serialized).toContain("To make your content easy to find, you need to:");
    expect(serialized).not.toContain("[!NOTE]");
  });

  it("does not register MDX syntax on the shared marked instance", () => {
    roundTrip(MDX_FIXTURE, "mdx");

    expect(marked.lexer('<Card title="A" />')[0]?.type).toBe("html");
  });

  it("serializes edited component text inside the original tags", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: createDocumentSchemaExtensions("mdx"),
      content: '<Note title="Hi">\n  Hello world.\n</Note>',
      contentType: "markdown",
    });
    let end = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "Hello world.") {
        end = pos + node.nodeSize;
      }
    });
    editor.commands.insertContentAt(end, " Bonjour");

    expect(normalizeDocumentMarkdown(editor.getMarkdown())).toBe(
      '<Note title="Hi">\n  Hello world. Bonjour\n</Note>',
    );
  });
});

describe("isLossyDocumentRoundTrip", () => {
  it("keeps original Markdown and MDX out of the save baseline when serialize changes it", () => {
    expect(isLossyDocumentRoundTrip("mdx", "<Tabs>\n  <Tab />\n</Tabs>", "# Tabs")).toBe(true);
    expect(isLossyDocumentRoundTrip("mdx", "# Hello", "# Hello")).toBe(false);
    expect(isLossyDocumentRoundTrip("markdown", "# Hello\n\n\nWorld", "# Hello\n\nWorld")).toBe(
      false,
    );
    expect(
      isLossyDocumentRoundTrip("markdown", '# T\n\n<div class="x">keep</div>', "# T\n\nkeep"),
    ).toBe(true);
  });

  it("does not treat GFM table column padding as a lossy round trip", () => {
    const compact = GFM_TABLE_FIXTURE;
    const padded = roundTrip(GFM_TABLE_FIXTURE, "markdown");

    expect(isLossyDocumentRoundTrip("markdown", compact, padded)).toBe(false);
  });

  it("preserves GFM table alignment markers when normalizing", () => {
    const separator = "| :--- | ---: | :---: |";
    expect(normalizeGfmTablesInMarkdown(separator)).toBe("| :--- | ---: | :---: |");
  });

  it("does not drop an empty third cell in a three-column table", () => {
    const table = `## T

Col1 | Col2 | Col3
--- | --- | ---
a | b |`;
    const serialized = `## T

| Col1 | Col2 | Col3 |
| --- | --- | --- |
| a | b | |`;

    expect(isLossyDocumentRoundTrip("markdown", table, serialized)).toBe(false);
  });

  it("does not treat an optional closing pipe as an extra table cell", () => {
    const table = `## T

Col1 | Col2
--- | ---
a | b |`;
    const serialized = `## T

| Col1 | Col2 |
| --- | --- |
| a | b |`;

    expect(isLossyDocumentRoundTrip("markdown", table, serialized)).toBe(false);
  });

  it("does not drop a trailing empty table cell without outer pipes", () => {
    const table = `## T

Col1 | Col2
--- | ---
x | `;
    const serialized = `## T

| Col1 | Col2 |
| --- | --- |
| x | |`;

    expect(isLossyDocumentRoundTrip("markdown", table, serialized)).toBe(false);
  });

  it("does not normalize table-like lines inside fenced code blocks", () => {
    const original = "```\n| a      | b |\n| --- | --- |\n```";
    const changed = "```\n| a      | c |\n| --- | --- |\n```";

    expect(isLossyDocumentRoundTrip("markdown", original, changed)).toBe(true);
  });

  it("treats dropped GFM table alignment as a lossy round trip", () => {
    const aligned = `## T

| Left | Right |
| :--- | ---: |
| a | b |`;
    const withoutAlignment = `## T

| Left | Right |
| --- | --- |
| a | b |`;

    expect(isLossyDocumentRoundTrip("markdown", aligned, withoutAlignment)).toBe(true);
  });
});

describe("JSX string props", () => {
  it("reads and rewrites one prop without touching the rest", () => {
    const tag = '<Card title="Old \\"x\\"" href={links.a} icon=\'star\'>';

    expect(readJsxStringProps(tag)).toEqual([
      { name: "title", value: 'Old "x"' },
      { name: "icon", value: "star" },
    ]);
    expect(writeJsxStringProp(tag, "title", "Nouveau")).toBe(
      "<Card title=\"Nouveau\" href={links.a} icon='star'>",
    );
  });
});
