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

export function isAsciidocFilename(filename: string) {
  const lower = filename.toLowerCase();
  return lower.endsWith(".adoc") || lower.endsWith(".asciidoc") || lower.endsWith(".asc");
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
    TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
    nodes.callout,
    ...(syntax === "mdx" ? [nodes.mdxRaw, nodes.mdxComponent, nodes.mdxInline] : []),
    Markdown.configure({ marked: new Marked() as never }),
  ];
}

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

function isGfmTableSeparatorLine(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && /^[\s|:-]+$/.test(trimmed) && trimmed.includes("-");
}

function isGfmTableRowLine(line: string) {
  return line.trim().includes("|");
}

function normalizeGfmTableDelimiter(cell: string) {
  const trimmed = cell.trim();
  if (!/^:?-{3,}:?$/.test(trimmed)) {
    return trimmed;
  }
  const leftColon = trimmed.startsWith(":");
  const rightColon = trimmed.endsWith(":") && !/^:-+$/.test(trimmed);
  return `${leftColon ? ":" : ""}---${rightColon ? ":" : ""}`;
}

function shouldStripTrailingTableDelimiter(
  hasLeadingPipe: boolean,
  hasTrailingPipe: boolean,
  parts: string[],
) {
  if (!hasTrailingPipe || parts.at(-1) !== "") {
    return false;
  }
  if (hasLeadingPipe) {
    return true;
  }
  const bodyParts = parts.slice(0, -1);
  return bodyParts.length >= 2 && bodyParts.every((part) => part !== "");
}

function normalizeGfmTableRow(line: string) {
  const trimmed = line.trim();
  const hasLeadingPipe = trimmed.startsWith("|");
  const hasTrailingPipe = trimmed.endsWith("|");
  let parts = trimmed.split("|").map((cell) => cell.trim());
  if (hasLeadingPipe && parts[0] === "") {
    parts = parts.slice(1);
  }
  if (shouldStripTrailingTableDelimiter(hasLeadingPipe, hasTrailingPipe, parts)) {
    parts = parts.slice(0, -1);
  }
  if (parts.length === 0) {
    return line;
  }
  if (parts.every((part) => /^:?-{3,}:?$/.test(part))) {
    return `| ${parts.map(normalizeGfmTableDelimiter).join(" | ")} |`;
  }
  return `| ${parts.join(" | ")} |`;
}

/** Collapses GFM table column padding so TipTap serialize width changes are not treated as lossy. */
export function normalizeGfmTablesInMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: string | null = null;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      output.push(line);
      index += 1;
      continue;
    }
    if (fence !== null) {
      output.push(line);
      index += 1;
      continue;
    }
    const nextLine = lines[index + 1];
    if (isGfmTableRowLine(line) && nextLine !== undefined && isGfmTableSeparatorLine(nextLine)) {
      while (index < lines.length && isGfmTableRowLine(lines[index])) {
        output.push(normalizeGfmTableRow(lines[index]));
        index += 1;
      }
      continue;
    }
    output.push(line);
    index += 1;
  }
  return output.join("\n");
}

/** True when page-view parse/serialize would change Markdown or MDX that must stay as written. */
export function isLossyDocumentRoundTrip(
  _syntax: DocumentEditorSyntax,
  original: string,
  normalized: string,
) {
  const plainOriginal = normalizeDocumentMarkdown(original);
  if (normalized === plainOriginal) {
    return false;
  }
  const tableComparableOriginal = normalizeDocumentMarkdown(normalizeGfmTablesInMarkdown(original));
  const tableComparableNormalized = normalizeDocumentMarkdown(
    normalizeGfmTablesInMarkdown(normalized),
  );
  if (tableComparableNormalized === tableComparableOriginal) {
    return false;
  }
  return true;
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
