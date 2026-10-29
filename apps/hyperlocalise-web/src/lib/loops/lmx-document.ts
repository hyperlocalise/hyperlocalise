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
import type { Theme, ThemeStyles } from "loops";

import { LOOPS_FIELD_ATTR } from "./html-envelope";
import { protectLoopsVariables } from "./variables";

export type LoopsTextBlockKind =
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "quote"
  | "code"
  | "button"
  | "listItem";

export type LoopsContentBlock =
  | { kind: "text"; block: LoopsTextBlockKind; text: string; href?: string; ordered?: boolean }
  | { kind: "image"; src?: string; alt?: string }
  | { kind: "divider" }
  | { kind: "component"; componentId?: string };

const TEXT_BLOCK_TAGS: Record<string, LoopsTextBlockKind> = {
  H1: "h1",
  H2: "h2",
  H3: "h3",
  PARAGRAPH: "paragraph",
  QUOTE: "quote",
  CODE: "code",
  BUTTON: "button",
  LISTITEM: "listItem",
};

function isTranslatableRun(text: string): boolean {
  return /[A-Za-zÀ-ÿ0-9]/.test(text) && text.trim().length > 0;
}

function parseTagAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*("[^"]*"|'[^']*')/g;
  let match = re.exec(source);
  while (match) {
    const raw = match[2] ?? "";
    attrs[match[1] ?? ""] = raw.slice(1, -1);
    match = re.exec(source);
  }
  return attrs;
}

type StackEntry = { tag: string; attrs: Record<string, string> };

function blockContext(stack: readonly StackEntry[]): {
  block: LoopsTextBlockKind;
  href?: string;
  ordered?: boolean;
} {
  let found: { block: LoopsTextBlockKind; href?: string } | null = null;
  let ordered: boolean | undefined;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (!entry) {
      continue;
    }
    const upper = entry.tag.toUpperCase();
    if (upper === "ORDEREDLIST" || upper === "NUMBEREDLIST") {
      ordered = true;
    } else if (upper === "UNORDEREDLIST" || upper === "BULLETEDLIST") {
      ordered = false;
    }
    if (!found) {
      const block = TEXT_BLOCK_TAGS[upper];
      if (block) {
        found = {
          block,
          ...(block === "button" && (entry.attrs.href || entry.attrs.url)
            ? { href: entry.attrs.href || entry.attrs.url }
            : {}),
        };
      }
    }
  }
  if (!found) {
    return { block: "paragraph", ordered };
  }
  return { block: found.block, href: found.href, ordered };
}

/**
 * Split LMX into ordered content blocks. Text runs use the same rule as the
 * segment extractor (any run with letters or digits), so the text-block
 * sequence matches `extractLoopsTextSegments` exactly. HTML comments are
 * skipped rather than treated as text.
 */
export function extractLoopsContentBlocks(lmx: string): LoopsContentBlock[] {
  const blocks: LoopsContentBlock[] = [];
  const stack: StackEntry[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9]*)((?:\s[^<>]*)?)\/?>|([^<>]+)/g;
  let match = re.exec(lmx);
  while (match) {
    const full = match[0] ?? "";
    const tagName = match[1];
    const attrSource = match[2] ?? "";
    const text = match[3];
    if (text !== undefined) {
      if (isTranslatableRun(text)) {
        const context = blockContext(stack);
        blocks.push({
          kind: "text",
          block: context.block,
          text,
          ...(context.href ? { href: context.href } : {}),
          ...(context.block === "listItem" ? { ordered: context.ordered ?? false } : {}),
        });
      }
    } else if (tagName && !full.startsWith("<!--")) {
      const upper = tagName.toUpperCase();
      const isClose = full.startsWith("</");
      const isSelfClosing = !isClose && (full.endsWith("/>") || upper === "BR");
      if (isClose) {
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index]?.tag.toUpperCase() === upper) {
            stack.length = index;
            break;
          }
        }
      } else if (upper === "IMAGE") {
        const attrs = parseTagAttributes(attrSource);
        blocks.push({ kind: "image", src: attrs.src, alt: attrs.alt });
      } else if (upper === "DIVIDER") {
        blocks.push({ kind: "divider" });
      } else if (upper === "COMPONENT") {
        blocks.push({ kind: "component", componentId: parseTagAttributes(attrSource).componentId });
      } else if (!isSelfClosing && upper !== "STYLE") {
        stack.push({ tag: tagName, attrs: parseTagAttributes(attrSource) });
      }
    }
    match = re.exec(lmx);
  }
  return blocks;
}

const NUMERIC_STYLE_KEYS = new Set([
  "backgroundXPadding",
  "backgroundYPadding",
  "bodyXPadding",
  "bodyYPadding",
  "borderWidth",
  "borderRadius",
  "buttonBodyXPadding",
  "buttonBodyYPadding",
  "buttonBorderWidth",
  "buttonBorderRadius",
  "buttonTextFontSize",
  "dividerBorderWidth",
  "textBaseFontSize",
  "textBaseLineHeight",
  "textBaseLetterSpacing",
  "heading1FontSize",
  "heading1LineHeight",
  "heading1LetterSpacing",
  "heading2FontSize",
  "heading2LineHeight",
  "heading2LetterSpacing",
  "heading3FontSize",
  "heading3LineHeight",
  "heading3LetterSpacing",
]);

export type LoopsStyleAttrs = {
  themeId?: string;
  overrides: ThemeStyles;
};

/** Read the top-level `<Style>` tag: theme preset plus inline overrides. */
export function parseLoopsStyleTag(lmx: string): LoopsStyleAttrs {
  const match = /<Style\b([^<>]*)\/?>/i.exec(lmx);
  const overrides: ThemeStyles = {};
  if (!match) {
    return { overrides };
  }
  const attrs = parseTagAttributes(match[1] ?? "");
  let themeId: string | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (key.toLowerCase() === "themeid") {
      themeId = value || undefined;
      continue;
    }
    if (NUMERIC_STYLE_KEYS.has(key) && value.trim() !== "" && !Number.isNaN(Number(value))) {
      (overrides as Record<string, unknown>)[key] = Number(value);
    } else {
      (overrides as Record<string, unknown>)[key] = value;
    }
  }
  return { themeId, overrides };
}

/**
 * Merge theme preset styles with `<Style>` overrides. Falls back to the
 * default theme, then to no styles when the theme cannot be resolved.
 */
export function resolveLoopsThemeStyles(input: {
  style: LoopsStyleAttrs;
  themes: readonly Theme[];
}): ThemeStyles {
  const named = input.style.themeId
    ? input.themes.find((theme) => theme.id === input.style.themeId)?.styles
    : undefined;
  const base = named ?? input.themes.find((theme) => theme.isDefault)?.styles ?? {};
  return { ...base, ...input.style.overrides };
}

function cssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

function cssLineHeight(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    return value > 10 ? `${value}%` : String(value);
  }
  return value;
}

function cssRule(property: string, value: string | undefined): string {
  return value === undefined ? "" : `${property}:${value};`;
}

/** Compile merged theme styles to the CSS used by the rendered document. */
export function renderLoopsThemeCss(styles: ThemeStyles): string {
  const border = [cssLength(styles.borderWidth), styles.borderColor]
    .filter((part) => part !== undefined)
    .join(" ");
  const buttonBorder = [cssLength(styles.buttonBorderWidth), styles.buttonBorderColor]
    .filter((part) => part !== undefined)
    .join(" ");
  const heading = (level: 1 | 2 | 3): string => {
    const color = styles[`heading${level}Color` as const];
    const fontSize = styles[`heading${level}FontSize` as const];
    const lineHeight = styles[`heading${level}LineHeight` as const];
    const letterSpacing = styles[`heading${level}LetterSpacing` as const];
    return (
      cssRule("color", color) +
      cssRule("font-size", cssLength(fontSize)) +
      cssRule("line-height", cssLineHeight(lineHeight)) +
      cssRule("letter-spacing", cssLength(letterSpacing))
    );
  };
  return (
    `.lmx-page{${cssRule("background-color", styles.backgroundColor)}` +
    `${cssRule("padding", joinLengths(styles.backgroundYPadding, styles.backgroundXPadding))}margin:0;}` +
    `.lmx-body{max-width:600px;margin:0 auto;box-sizing:border-box;` +
    `${cssRule("background-color", styles.bodyColor)}` +
    `${cssRule("padding", joinLengths(styles.bodyYPadding, styles.bodyXPadding))}` +
    `${cssRule("border", border || undefined)}` +
    `${cssRule("border-radius", cssLength(styles.borderRadius))}` +
    `${cssRule("font-family", fontStack(styles.bodyFontFamily, styles.bodyFontCategory))}` +
    `${cssRule("color", styles.textBaseColor)}` +
    `${cssRule("font-size", cssLength(styles.textBaseFontSize))}` +
    `${cssRule("line-height", cssLineHeight(styles.textBaseLineHeight))}` +
    `${cssRule("letter-spacing", cssLength(styles.textBaseLetterSpacing))}}` +
    `.lmx-body a{${cssRule("color", styles.textLinkColor)}}` +
    `.lmx-h1{${heading(1)}margin:0 0 16px;}` +
    `.lmx-h2{${heading(2)}margin:0 0 12px;}` +
    `.lmx-h3{${heading(3)}margin:0 0 8px;}` +
    `.lmx-p{margin:0 0 12px;}` +
    `.lmx-quote{margin:0 0 12px;padding-left:12px;border-left:3px solid ${styles.dividerColor ?? "#e5e7eb"};}` +
    `.lmx-code{margin:0 0 12px;padding:12px;border-radius:6px;background:rgba(0,0,0,0.05);font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;}` +
    `.lmx-btn{display:inline-block;text-decoration:none;box-sizing:border-box;` +
    `${cssRule("background-color", styles.buttonBodyColor)}` +
    `${cssRule("color", styles.buttonTextColor)}` +
    `${cssRule("font-size", cssLength(styles.buttonTextFontSize))}` +
    `${cssRule("border", buttonBorder || undefined)}` +
    `${cssRule("border-radius", cssLength(styles.buttonBorderRadius))}` +
    `${cssRule("padding", joinLengths(styles.buttonBodyYPadding, styles.buttonBodyXPadding))}}` +
    `.lmx-btn-label{margin:0;}` +
    `.lmx-divider{margin:16px 0;${cssRule(
      "border-top",
      styles.dividerBorderWidth !== undefined || styles.dividerColor
        ? `${cssLength(styles.dividerBorderWidth) ?? "1px"} solid ${styles.dividerColor ?? "#e5e7eb"}`
        : undefined,
    )}}` +
    `.lmx-img{max-width:100%;height:auto;}` +
    `.lmx-meta{font-size:12px;opacity:0.7;margin:0 0 4px;}`
  );
}

function joinLengths(
  vertical: number | string | undefined,
  horizontal: number | string | undefined,
): string | undefined {
  const top = cssLength(vertical);
  const side = cssLength(horizontal);
  if (top === undefined && side === undefined) {
    return undefined;
  }
  return `${top ?? "0"} ${side ?? top ?? "0"}`;
}

function fontStack(family: string | undefined, category: string | undefined): string | undefined {
  const quoted = family ? `"${family}"` : undefined;
  if (quoted && category) {
    return `${quoted},${category}`;
  }
  return quoted ?? category;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const TEXT_BLOCK_CLASSES: Record<LoopsTextBlockKind, string> = {
  h1: "lmx-h1",
  h2: "lmx-h2",
  h3: "lmx-h3",
  paragraph: "lmx-p",
  quote: "lmx-quote",
  code: "lmx-code",
  button: "lmx-btn-label",
  listItem: "lmx-li",
};

function renderTextBlock(input: {
  block: LoopsTextBlockKind;
  protectedText: string;
  href?: string;
  ordered?: boolean;
  field: string | null;
}): string {
  const inner =
    input.field === null
      ? `<div class="${TEXT_BLOCK_CLASSES[input.block]}">${escapeHtml(input.protectedText)}</div>`
      : `<div class="${TEXT_BLOCK_CLASSES[input.block]}" ${LOOPS_FIELD_ATTR}="${input.field}">${escapeHtml(input.protectedText)}</div>`;
  if (input.block === "button" && input.href) {
    return `<div class="lmx-btn-wrap"><a class="lmx-btn" href="${escapeHtml(input.href)}">${inner}</a></div>`;
  }
  return inner;
}

/**
 * Render the email as a styled HTML document for File view. Translatable runs
 * keep `data-hl-loops-field="segment-N"` markers in extraction order, so the
 * existing envelope parser and push splice keep working. Static content
 * (images, expanded components) renders without markers.
 */
export function renderLoopsEmailDocument(input: {
  subject: string;
  previewText?: string;
  lmx: string;
  styles?: ThemeStyles;
  components?: ReadonlyMap<string, string>;
}): { html: string; segments: string[]; tokensBySegment: string[][] } {
  const segments: string[] = [];
  const tokensBySegment: string[][] = [];
  const parts: string[] = [];
  let listOpen: "ol" | "ul" | null = null;

  const closeList = () => {
    if (listOpen) {
      parts.push(listOpen === "ol" ? "</ol>" : "</ul>");
      listOpen = null;
    }
  };

  const renderBlocks = (blocks: readonly LoopsContentBlock[], isStatic: boolean): void => {
    for (const block of blocks) {
      if (block.kind === "text") {
        if (block.block === "listItem" && !isStatic) {
          const want = block.ordered ? "ol" : "ul";
          if (listOpen !== want) {
            closeList();
            parts.push(want === "ol" ? '<ol class="lmx-list">' : '<ul class="lmx-list">');
            listOpen = want;
          }
          const field = `segment-${segments.length}`;
          const protectedSegment = protectLoopsVariables(block.text);
          segments.push(block.text);
          tokensBySegment.push(protectedSegment.tokens);
          parts.push(
            `<li class="lmx-li-item"><div class="lmx-li" ${LOOPS_FIELD_ATTR}="${field}">${escapeHtml(protectedSegment.text)}</div></li>`,
          );
          continue;
        }
        closeList();
        if (isStatic) {
          parts.push(
            renderTextBlock({
              block: block.block,
              protectedText: block.text,
              href: block.href,
              field: null,
            }),
          );
        } else {
          const field = `segment-${segments.length}`;
          const protectedSegment = protectLoopsVariables(block.text);
          segments.push(block.text);
          tokensBySegment.push(protectedSegment.tokens);
          parts.push(
            renderTextBlock({
              block: block.block,
              protectedText: protectedSegment.text,
              href: block.href,
              field,
            }),
          );
        }
      } else if (block.kind === "image") {
        closeList();
        parts.push(
          `<div class="lmx-img-wrap"><img class="lmx-img" src="${escapeHtml(block.src ?? "")}" alt="${escapeHtml(block.alt ?? "")}"></div>`,
        );
      } else if (block.kind === "divider") {
        closeList();
        parts.push('<div class="lmx-divider" role="separator"></div>');
      } else if (block.kind === "component") {
        closeList();
        const componentLmx = block.componentId
          ? input.components?.get(block.componentId)
          : undefined;
        if (componentLmx) {
          renderBlocks(extractLoopsContentBlocks(componentLmx), true);
        }
      }
    }
  };

  renderBlocks(extractLoopsContentBlocks(input.lmx), false);
  closeList();

  const subject = protectLoopsVariables(input.subject);
  const preview = protectLoopsVariables(input.previewText ?? "");
  const css = input.styles ? renderLoopsThemeCss(input.styles) : "";
  const html = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    css ? `<style>${css}</style>` : "",
    "</head>",
    '<body class="lmx-page">',
    `<div class="lmx-meta" ${LOOPS_FIELD_ATTR}="subject">${escapeHtml(subject.text)}</div>`,
    preview.text
      ? `<div class="lmx-meta" ${LOOPS_FIELD_ATTR}="previewText">${escapeHtml(preview.text)}</div>`
      : "",
    '<div class="lmx-body">',
    ...parts,
    "</div></body></html>",
  ].join("");
  return { html, segments, tokensBySegment };
}
