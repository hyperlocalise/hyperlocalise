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
import { countRunes } from "@/lib/qa/count-runes";

import {
  OOXML_NAMESPACE_MARKUP,
  nodeIs,
  nodeQualified,
  type OoxmlNode,
  type OoxmlRenderer,
} from "./ooxml-tree";

// Mirrors internal/i18n/translationfileparser/ooxml_paragraph.go. An Office paragraph is
// one entry. Its text is the paragraph's visible text in the formatting that holds most of
// it. Text in other formatting or inside a link is wrapped in a pair of placeholders, and
// objects that are not text, such as images, fields, and footnote marks, are single
// placeholders:
//
//   Read the \x1eHLOXPH_6F30_0\x1fterms\x1eHLOXPH_6330_1\x1f first.
//
// A placeholder is \x1eHLOXPH_<hex>_<n>\x1f, where <hex> encodes "o<g>" or "c<g>" (open and
// close formatting group g) or "a<k>" (object k), and <n> is its position in the entry.

export const OOXML_TOKEN_MARKER = "\x1eHLOXPH_";
const TOKEN_OPEN = "o";
const TOKEN_CLOSE = "c";
const TOKEN_ATOM = "a";
const KEY_SEPARATOR = "#";
export const OOXML_LINE_BREAK = "\n";

const PRESERVE_PLACEHOLDERS_LINE =
  "Preserve every placeholder token matching \\x1eHLOXPH_…\\x1f exactly (do not translate, remove, or rename them). Text between an opening and a closing token keeps that formatting, so move the pair with the words it wraps.";

const TOKEN_PATTERN = new RegExp(`${OOXML_TOKEN_MARKER}([A-F0-9]+)_([0-9]+)\x1f`, "g");
const LETTER_PATTERN = /\p{L}/u;

export type OoxmlEntry = { key: string; text: string; context?: string };

type Piece = {
  atom: boolean;
  text: string;
  /** The run's properties element as written; empty when absent. */
  props: string;
  /** Takes props and link from the neighbouring text, as line breaks do. */
  inherit: boolean;
  link: OoxmlNode | null;
  atomNodes: OoxmlNode[];
  atomProps: string;
  wrapRun: boolean;
};

type Span = {
  atom: boolean;
  plain: boolean;
  text: string;
  props: string;
  link: OoxmlNode | null;
  piece: Piece | null;
};

type ParagraphSpans = {
  spans: Span[];
  groups: Span[];
  atoms: Span[];
  baseProps: string;
};

export type OoxmlTextWriter = (
  out: string[],
  paragraph: OoxmlParagraph,
  props: string,
  text: string,
) => void;

export class OoxmlParagraph {
  isFallback = false;
  readonly head: OoxmlNode[] = [];
  readonly tail: OoxmlNode[] = [];
  readonly pieces: Piece[] = [];
  context = "";
  private textSeen = false;

  constructor(
    readonly node: OoxmlNode,
    public index: number,
  ) {}

  addText(text: string, props: string, link: OoxmlNode | null, inherit: boolean) {
    if (text === "") {
      return;
    }
    this.textSeen = true;
    this.pieces.push({
      atom: false,
      text,
      props,
      link,
      inherit,
      atomNodes: [],
      atomProps: "",
      wrapRun: false,
    });
  }

  addAtom(nodes: OoxmlNode[], props: string, wrapRun: boolean) {
    this.pieces.push({
      atom: true,
      text: "",
      props: "",
      link: null,
      inherit: false,
      atomNodes: nodes,
      atomProps: props,
      wrapRun,
    });
  }

  addMarker(node: OoxmlNode) {
    (this.textSeen ? this.tail : this.head).push(node);
  }

  private resolveInheritance() {
    this.pieces.forEach((piece, index) => {
      if (piece.atom || !piece.inherit) {
        return;
      }
      const source = this.neighbourText(index);
      if (source) {
        piece.props = source.props;
        piece.link = source.link;
      }
    });
  }

  private neighbourText(index: number): Piece | undefined {
    for (let j = index - 1; j >= 0; j--) {
      const piece = this.pieces[j]!;
      if (!piece.atom && !piece.inherit) return piece;
    }
    for (let j = index + 1; j < this.pieces.length; j++) {
      const piece = this.pieces[j]!;
      if (!piece.atom && !piece.inherit) return piece;
    }
    return undefined;
  }

  /** The formatting holding most text outside links; ties go to the first one written. */
  private baseProps(): string {
    const counts = new Map<string, number>();
    for (const piece of this.pieces) {
      if (piece.atom || piece.link) continue;
      counts.set(piece.props, (counts.get(piece.props) ?? 0) + countRunes(piece.text));
    }
    let best = "";
    let bestCount = -1;
    for (const [props, count] of counts) {
      if (count > bestCount) {
        best = props;
        bestCount = count;
      }
    }
    return best;
  }

  spans(): ParagraphSpans {
    this.resolveInheritance();
    const baseProps = this.baseProps();
    const spans: Span[] = [];
    for (const piece of this.pieces) {
      if (piece.atom) {
        spans.push({ atom: true, plain: false, text: "", props: "", link: null, piece });
        continue;
      }
      const plain = piece.link === null && piece.props === baseProps;
      const last = spans[spans.length - 1];
      if (
        last &&
        !last.atom &&
        last.plain === plain &&
        last.link === piece.link &&
        last.props === piece.props
      ) {
        last.text += piece.text;
        continue;
      }
      spans.push({
        atom: false,
        plain,
        text: piece.text,
        props: piece.props,
        link: piece.link,
        piece: null,
      });
    }
    return {
      spans,
      baseProps,
      atoms: spans.filter((span) => span.atom),
      groups: spans.filter((span) => !span.atom && !span.plain),
    };
  }

  segment(): string {
    let out = "";
    let ordinal = 0;
    let group = 0;
    let atom = 0;
    for (const span of this.spans().spans) {
      if (span.atom) {
        out += ooxmlToken(TOKEN_ATOM, atom++, ordinal++);
      } else if (span.plain) {
        out += span.text;
      } else {
        out += ooxmlToken(TOKEN_OPEN, group, ordinal);
        out += span.text;
        out += ooxmlToken(TOKEN_CLOSE, group, ordinal + 1);
        group++;
        ordinal += 2;
      }
    }
    return out;
  }

  write(out: string[], renderer: OoxmlRenderer, translated: string, writeText: OoxmlTextWriter) {
    const { groups, atoms, baseProps } = this.spans();
    out.push(renderer.slice(this.node.start, this.node.startTagEnd));
    for (const node of this.head) {
      renderer.render(out, node);
    }
    const used = atoms.map(() => false);
    let current = -1;
    for (const item of parseOoxmlTranslation(translated)) {
      if (item.kind === undefined) {
        const group = current >= 0 ? groups[current] : undefined;
        if (group) {
          this.writeLinkedText(out, renderer, group.link, group.props, item.text, writeText);
        } else {
          writeText(out, this, baseProps, item.text);
        }
        continue;
      }
      if (item.kind === TOKEN_OPEN) {
        if (item.index < groups.length) current = item.index;
      } else if (item.kind === TOKEN_CLOSE) {
        if (item.index === current) current = -1;
      } else if (item.index < atoms.length && !used[item.index]) {
        used[item.index] = true;
        this.writeAtom(out, renderer, atoms[item.index]!.piece!);
      }
    }
    atoms.forEach((atom, index) => {
      if (!used[index]) this.writeAtom(out, renderer, atom.piece!);
    });
    for (const node of this.tail) {
      renderer.render(out, node);
    }
    out.push(renderer.slice(this.node.closeStart, this.node.end));
  }

  private writeLinkedText(
    out: string[],
    renderer: OoxmlRenderer,
    link: OoxmlNode | null,
    props: string,
    text: string,
    writeText: OoxmlTextWriter,
  ) {
    if (!link || link.selfClosing || text === "") {
      writeText(out, this, props, text);
      return;
    }
    out.push(renderer.slice(link.start, link.startTagEnd));
    writeText(out, this, props, text);
    out.push(renderer.slice(link.closeStart, link.end));
  }

  private writeAtom(out: string[], renderer: OoxmlRenderer, piece: Piece) {
    const run = nodeQualified(this.node, "r");
    if (piece.wrapRun) {
      out.push(`<${run}>`, piece.atomProps);
    }
    for (const node of piece.atomNodes) {
      renderer.render(out, node);
    }
    if (piece.wrapRun) {
      out.push(`</${run}>`);
    }
  }
}

function ooxmlToken(kind: string, index: number, ordinal: number): string {
  const desc = `${kind}${index}`;
  let hex = "";
  for (let i = 0; i < desc.length; i++) {
    hex += desc.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
  }
  return `${OOXML_TOKEN_MARKER}${hex}_${ordinal}\x1f`;
}

function decodeOoxmlToken(hex: string): { kind: string; index: number } | undefined {
  if (hex.length % 2 !== 0) {
    return undefined;
  }
  let desc = "";
  for (let i = 0; i < hex.length; i += 2) {
    desc += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  const kind = desc[0];
  const digits = desc.slice(1);
  if (
    desc.length < 2 ||
    !/^[0-9]+$/.test(digits) ||
    (kind !== TOKEN_OPEN && kind !== TOKEN_CLOSE && kind !== TOKEN_ATOM)
  ) {
    return undefined;
  }
  return { kind, index: Number.parseInt(digits, 10) };
}

type TranslatedItem = { text: string; kind?: undefined } | { kind: string; index: number };

function parseOoxmlTranslation(translated: string): TranslatedItem[] {
  const items: TranslatedItem[] = [];
  let pos = 0;
  for (const match of translated.matchAll(TOKEN_PATTERN)) {
    if (match.index > pos) {
      items.push({ text: normalizeOoxmlText(translated.slice(pos, match.index)) });
    }
    const token = decodeOoxmlToken(match[1]!);
    if (token) {
      items.push(token);
    }
    pos = match.index + match[0].length;
  }
  if (pos < translated.length) {
    items.push({ text: normalizeOoxmlText(translated.slice(pos)) });
  }
  return items;
}

/** Turns other line separators into line breaks and drops characters XML 1.0 cannot hold. */
export function normalizeOoxmlText(value: string): string {
  let out = "";
  for (const char of value.replaceAll("\r\n", OOXML_LINE_BREAK)) {
    const code = char.codePointAt(0)!;
    if (char === "\v" || char === "\r" || char === "\u2028") {
      out += OOXML_LINE_BREAK;
    } else if (
      char === "\t" ||
      char === "\n" ||
      (code >= 0x20 && code !== 0xfffe && code !== 0xffff && !(code >= 0xd800 && code <= 0xdfff))
    ) {
      out += char;
    }
  }
  return out;
}

export function normalizeOoxmlSourceRunText(text: string): string {
  if (!/[\r\n]/.test(text)) {
    return text;
  }
  return text
    .split(/[\r\n]/)
    .filter((field) => field !== "")
    .join(" ");
}

/** Maps the Fallback copy of each paragraph in a Choice to that paragraph. */
type AlternateFrame = { choice: number[]; cursor: number };

export type OoxmlWalker = {
  isParagraph: (node: OoxmlNode) => boolean;
  build: (paragraph: OoxmlParagraph) => void;
  enter?: (node: OoxmlNode) => () => void;
};

export function walkOoxmlParagraphs(root: OoxmlNode, walker: OoxmlWalker): OoxmlParagraph[] {
  const paragraphs: OoxmlParagraph[] = [];
  let count = 0;
  const walk = (
    node: OoxmlNode,
    frame: AlternateFrame | null,
    inChoice: boolean,
    inFallback: boolean,
  ) => {
    for (const child of node.children) {
      if (nodeIs(child, OOXML_NAMESPACE_MARKUP, "AlternateContent")) {
        const inner: AlternateFrame = { choice: [], cursor: 0 };
        for (const branch of child.children) {
          if (nodeIs(branch, OOXML_NAMESPACE_MARKUP, "Choice")) walk(branch, inner, true, false);
          else if (nodeIs(branch, OOXML_NAMESPACE_MARKUP, "Fallback"))
            walk(branch, inner, false, true);
        }
        continue;
      }
      if (walker.isParagraph(child)) {
        const counted = count++;
        const paragraph = new OoxmlParagraph(child, counted);
        if (inFallback && frame && frame.cursor < frame.choice.length) {
          paragraph.index = frame.choice[frame.cursor]!;
          paragraph.isFallback = true;
          frame.cursor++;
        } else if (inChoice && frame) {
          frame.choice.push(counted);
        }
        walker.build(paragraph);
        paragraphs.push(paragraph);
        walk(child, frame, inChoice, inFallback);
        continue;
      }
      const leave = walker.enter?.(child) ?? (() => {});
      walk(child, frame, inChoice, inFallback);
      leave();
    }
  };
  walk(root, null, false, false);
  return paragraphs;
}

export function ooxmlEntryKey(partName: string, index: number): string {
  return `${partName}${KEY_SEPARATOR}${index}`;
}

export function ooxmlHasLetter(text: string): boolean {
  return LETTER_PATTERN.test(text.replace(TOKEN_PATTERN, ""));
}

export function ooxmlPartEntries(partName: string, paragraphs: OoxmlParagraph[]): OoxmlEntry[] {
  const entries: OoxmlEntry[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.isFallback) continue;
    const text = paragraph.segment();
    if (!ooxmlHasLetter(text)) continue;
    const context = text.includes(OOXML_TOKEN_MARKER)
      ? `${paragraph.context}\n${PRESERVE_PLACEHOLDERS_LINE}`.trim()
      : paragraph.context;
    entries.push({
      key: ooxmlEntryKey(partName, paragraph.index),
      text,
      ...(context ? { context } : {}),
    });
  }
  return entries;
}

/**
 * Regenerates the paragraphs of one part whose translation differs from the source text.
 * Returns null when nothing changes, so callers keep the part as is.
 */
export function marshalOoxmlPart(input: {
  renderer: OoxmlRenderer;
  root: OoxmlNode;
  paragraphs: OoxmlParagraph[];
  partName: string;
  values: Readonly<Record<string, string>>;
  writeText: OoxmlTextWriter;
}): string | null {
  let changed = false;
  for (const paragraph of input.paragraphs) {
    const value = input.values[ooxmlEntryKey(input.partName, paragraph.index)];
    if (!value) continue;
    const source = paragraph.segment();
    if (!ooxmlHasLetter(source) || normalizeOoxmlText(value) === source) continue;
    input.renderer.replace(paragraph.node, (out) =>
      paragraph.write(out, input.renderer, value, input.writeText),
    );
    changed = true;
  }
  if (!changed) {
    return null;
  }
  const out: string[] = [];
  input.renderer.render(out, input.root);
  return out.join("");
}

/** The Office placeholders in `text`, sorted, for multiset comparison. */
export function ooxmlPlaceholderTokens(text: string): string[] {
  if (!text.includes(OOXML_TOKEN_MARKER)) {
    return [];
  }
  return [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]).toSorted();
}
