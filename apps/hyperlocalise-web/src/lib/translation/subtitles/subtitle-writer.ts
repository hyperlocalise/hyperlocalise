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
import path from "node:path";

import { err, ok, type Result } from "@/lib/primitives/result/results";

export type SubtitleKind = "srt" | "vtt" | "sbv";

export type SubtitleTranslationExport = {
  content: Buffer;
  contentType: string;
  extension: ".srt" | ".vtt" | ".sbv";
};

const SRT_TIMESTAMP =
  /^(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}\s+-->\s+(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}(?:\s+\S.*)?$/;
const VTT_TIMESTAMP =
  /^(?:\d{2,}:)?\d{1,2}:\d{2}[,.]\d{1,3}\s+-->\s+(?:\d{2,}:)?\d{1,2}:\d{2}[,.]\d{1,3}(?:\s+\S.*)?$/;
const SBV_TIMESTAMP = /^\d+:\d{2}:\d{2}\.\d{1,3},\d+:\d{2}:\d{2}\.\d{1,3}$/;

type SubtitleLine = { start: number; end: number; text: string };

type SubtitleCue = {
  key: string;
  textStart: number;
  textEnd: number;
};

type SubtitleDocument = {
  template: string;
  kind: SubtitleKind;
  newline: string;
  entries: SubtitleCue[];
};

export function resolveSubtitleKind(sourcePath: string): SubtitleKind | null {
  switch (path.extname(sourcePath).toLowerCase()) {
    case ".srt":
      return "srt";
    case ".vtt":
      return "vtt";
    case ".sbv":
      return "sbv";
    default:
      return null;
  }
}

export function subtitleExportContentType(kind: SubtitleKind): string {
  switch (kind) {
    case "srt":
      return "application/x-subrip";
    case "vtt":
      return "text/vtt";
    case "sbv":
      return "text/plain; charset=utf-8";
  }
}

export function marshalSubtitles(
  template: Uint8Array | string,
  values: Readonly<Record<string, string>>,
  kind: SubtitleKind,
): Result<Buffer, { code: "invalid_utf8" | "parse_failed"; message: string }> {
  const text = typeof template === "string" ? template : new TextDecoder().decode(template);
  try {
    const doc = parseSubtitleDocument(text, kind);
    return ok(Buffer.from(renderSubtitleDocument(doc, values), "utf8"));
  } catch (error) {
    return err({
      code: "parse_failed",
      message: error instanceof Error ? error.message : "subtitle parse failed",
    });
  }
}

function parseSubtitleDocument(text: string, kind: SubtitleKind): SubtitleDocument {
  const stripped = stripBom(text);
  const doc: SubtitleDocument = {
    template: stripped,
    kind,
    newline: stripped.includes("\r\n") ? "\r\n" : "\n",
    entries: [],
  };
  if (stripped.trim() === "") {
    return doc;
  }

  const lines = scanSubtitleLines(stripped);
  let start = 0;
  if (kind === "vtt") {
    start = consumeWebVttHeader(lines);
  }

  let cueIndex = 0;
  for (; start < lines.length;) {
    start = skipBlankSubtitleLines(lines, start);
    if (start >= lines.length) {
      break;
    }
    const blockEnd = nextSubtitleBlockEnd(lines, start);
    const block = lines.slice(start, blockEnd);
    start = blockEnd;

    if (kind === "vtt" && block[0] && isWebVttNonCueBlock(block[0].text)) {
      continue;
    }

    const cue = parseSubtitleCue(block, kind, cueIndex + 1);
    if (cue.textStart >= cue.textEnd) {
      continue;
    }
    if (stripped.slice(cue.textStart, cue.textEnd).trim() === "") {
      continue;
    }
    cueIndex += 1;
    cue.key = subtitleCueKey(kind, cueIndex);
    doc.entries.push(cue);
  }

  return doc;
}

function renderSubtitleDocument(
  doc: SubtitleDocument,
  values: Readonly<Record<string, string>>,
): string {
  let cursor = 0;
  let out = "";
  for (const entry of doc.entries) {
    if (entry.textStart < cursor || entry.textStart > doc.template.length) {
      continue;
    }
    out += doc.template.slice(cursor, entry.textStart);
    const translated = values[entry.key];
    if (translated !== undefined) {
      out += encodeSubtitleCueText(translated, doc.newline);
    } else {
      out += doc.template.slice(entry.textStart, entry.textEnd);
    }
    cursor = entry.textEnd;
  }
  out += doc.template.slice(cursor);
  return out;
}

function parseSubtitleCue(
  block: SubtitleLine[],
  kind: SubtitleKind,
  cueNumber: number,
): SubtitleCue {
  if (block.length === 0) {
    throw new Error(`${kind}: cue ${cueNumber}: empty cue`);
  }
  let timingIndex = 0;
  if (!isSubtitleTimestampLine(block[0]!.text, kind)) {
    if (block.length > 1 && isSubtitleTimestampLine(block[1]!.text, kind)) {
      timingIndex = 1;
    } else {
      throw new Error(`${kind}: cue ${cueNumber}: missing timestamp line`);
    }
  }
  const textLines = block.slice(timingIndex + 1);
  if (textLines.length === 0) {
    return { key: "", textStart: 0, textEnd: 0 };
  }
  return {
    key: "",
    textStart: textLines[0]!.start,
    textEnd: textLines[textLines.length - 1]!.end,
  };
}

function consumeWebVttHeader(lines: SubtitleLine[]): number {
  let idx = skipBlankSubtitleLines(lines, 0);
  if (idx >= lines.length || !looksLikeWebVttHeader(lines[idx]!.text)) {
    throw new Error("vtt: file must start with WEBVTT");
  }
  idx += 1;
  if (idx < lines.length && lines[idx]!.text.trim() !== "") {
    idx = nextSubtitleBlockEnd(lines, idx - 1);
  }
  return skipBlankSubtitleLines(lines, idx);
}

function scanSubtitleLines(text: string): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  for (let start = 0; start < text.length;) {
    const next = text.indexOf("\n", start);
    const lineEnd = next >= 0 ? next : text.length;
    const after = next >= 0 ? lineEnd + 1 : text.length;
    let end = lineEnd;
    if (end > start && text[end - 1] === "\r") {
      end -= 1;
    }
    lines.push({ start, end, text: text.slice(start, end) });
    start = after;
  }
  return lines;
}

function skipBlankSubtitleLines(lines: SubtitleLine[], start: number): number {
  let i = start;
  while (i < lines.length && isBlankSubtitleLine(lines[i]!.text)) {
    i += 1;
  }
  return i;
}

function nextSubtitleBlockEnd(lines: SubtitleLine[], start: number): number {
  let i = start;
  while (i < lines.length && !isBlankSubtitleLine(lines[i]!.text)) {
    i += 1;
  }
  return i;
}

function looksLikeWebVttHeader(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "WEBVTT" || trimmed.startsWith("WEBVTT ") || trimmed.startsWith("WEBVTT\t");
}

function isWebVttNonCueBlock(first: string): boolean {
  const trimmed = first.trim();
  return (
    trimmed === "NOTE" ||
    trimmed.startsWith("NOTE ") ||
    trimmed.startsWith("NOTE\t") ||
    trimmed === "STYLE" ||
    trimmed.startsWith("STYLE ") ||
    trimmed.startsWith("STYLE\t") ||
    trimmed === "REGION" ||
    trimmed.startsWith("REGION ") ||
    trimmed.startsWith("REGION\t")
  );
}

function isSubtitleTimestampLine(line: string, kind: SubtitleKind): boolean {
  const trimmed = line.trim();
  if (kind === "sbv") {
    return SBV_TIMESTAMP.test(trimmed);
  }
  if (!line.includes("-->")) {
    return false;
  }
  return kind === "vtt" ? VTT_TIMESTAMP.test(trimmed) : SRT_TIMESTAMP.test(trimmed);
}

function subtitleCueKey(kind: SubtitleKind, index: number): string {
  const prefix = kind === "vtt" ? "vtt." : kind === "sbv" ? "sbv." : "srt.";
  if (index < 10) {
    return `${prefix}000${index}`;
  }
  if (index < 100) {
    return `${prefix}00${index}`;
  }
  if (index < 1000) {
    return `${prefix}0${index}`;
  }
  return `${prefix}${index}`;
}

function encodeSubtitleCueText(value: string, newline: string): string {
  let out = "";
  let hasWritten = false;
  for (let start = 0; start < value.length;) {
    const next = value.indexOf("\n", start);
    const lineEnd = next >= 0 ? next : value.length;
    const after = next >= 0 ? lineEnd + 1 : value.length;
    let end = lineEnd;
    if (end > start && value[end - 1] === "\r") {
      end -= 1;
    }
    const line = value.slice(start, end);
    const trimmed = trimRightSpaceTab(line);
    if (!isBlankSubtitleLine(trimmed)) {
      if (hasWritten) {
        out += newline;
      }
      out += trimmed;
      hasWritten = true;
    }
    start = after;
  }
  return out;
}

function trimRightSpaceTab(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === " " || value[end - 1] === "\t")) {
    end -= 1;
  }
  return value.slice(0, end);
}

function isBlankSubtitleLine(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) {
      continue;
    }
    if (c < 0x80) {
      return false;
    }
    for (const char of value.slice(i)) {
      if (!/\p{White_Space}/u.test(char)) {
        return false;
      }
    }
    return true;
  }
  return true;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
