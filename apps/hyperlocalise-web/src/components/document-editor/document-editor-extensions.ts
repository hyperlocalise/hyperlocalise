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
import { resolveExtensions, type AnyExtension, type JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Marked } from "marked";

import { DocumentCallout } from "./document-editor-callout";
import { MdxComponent, MdxInline, MdxRaw } from "./document-editor-mdx";

export type DocumentEditorSyntax = "markdown" | "mdx";

export function isMdxFilename(filename: string) {
  return filename.toLowerCase().endsWith(".mdx");
}

/**
 * Schema and Markdown syntax for a document. Underline is left out because
 * Markdown cannot store it. Tokenizers are registered on a private `Marked`
 * instance so MDX syntax never reaches other editors on the page.
 */
export type DocumentCustomNodes = {
  callout: AnyExtension;
  mdxRaw: AnyExtension;
  mdxComponent: AnyExtension;
  mdxInline: AnyExtension;
};

const PLAIN_CUSTOM_NODES: DocumentCustomNodes = {
  callout: DocumentCallout,
  mdxRaw: MdxRaw,
  mdxComponent: MdxComponent,
  mdxInline: MdxInline,
};

export function createDocumentSchemaExtensions(
  syntax: DocumentEditorSyntax,
  nodes: DocumentCustomNodes = PLAIN_CUSTOM_NODES,
): AnyExtension[] {
  return [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, linkOnPaste: true, HTMLAttributes: { target: null } },
      heading: { levels: [1, 2, 3, 4] },
    }),
    TaskList.configure({ HTMLAttributes: { class: "document-task-list" } }),
    TaskItem.configure({ nested: true, HTMLAttributes: { class: "document-task-item" } }),
    Image.configure({ inline: false, allowBase64: false }),
    TableKit.configure({ table: { resizable: false } }),
    nodes.callout,
    ...(syntax === "mdx" ? [nodes.mdxRaw, nodes.mdxComponent, nodes.mdxInline] : []),
    Markdown.configure({ marked: new Marked() as never }),
  ];
}

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/** True when page-view parse/serialize would change Markdown or MDX that must stay as written. */
export function isLossyDocumentRoundTrip(
  _syntax: DocumentEditorSyntax,
  original: string,
  normalized: string,
) {
  return normalized !== normalizeDocumentMarkdown(original);
}

/** Collapses runs of blank lines that renderers leave around blocks, outside code fences. */
export function normalizeDocumentMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
    }
    if (fence === null && !line.trim() && output.length > 0 && !output.at(-1)?.trim()) {
      continue;
    }
    output.push(fence === null && !line.trim() ? "" : line);
  }
  return output.join("\n").replace(/\n+$/, "");
}

/** Headless parser and serializer, for reading the source document without an editor. */
export function createDocumentMarkdownManager(syntax: DocumentEditorSyntax) {
  return new MarkdownManager({
    marked: new Marked() as never,
    extensions: resolveExtensions(createDocumentSchemaExtensions(syntax)).filter(
      (extension) => extension.name !== "markdown",
    ),
  });
}

export function parseDocumentMarkdown(markdown: string, syntax: DocumentEditorSyntax): JSONContent {
  return createDocumentMarkdownManager(syntax).parse(markdown);
}

export function serializeDocumentBlock(
  manager: Pick<MarkdownManager, "serialize">,
  block: JSONContent,
): string {
  return normalizeDocumentMarkdown(manager.serialize({ type: "doc", content: [block] }));
}
