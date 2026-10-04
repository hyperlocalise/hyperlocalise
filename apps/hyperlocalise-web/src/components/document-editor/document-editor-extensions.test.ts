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
import { Editor } from "@tiptap/core";
import { marked } from "marked";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createDocumentSchemaExtensions,
  normalizeDocumentMarkdown,
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

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

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
