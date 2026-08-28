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
import { TMX_INLINE_ELEMENTS } from "./tmx-constants";
import type { TmxExportEntry, TmxHeader, TmxProperty } from "./tmx-types";

export function escapeXmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeXmlAttr(value: string) {
  return escapeXmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Serializes stored segment content for a `<seg>` element.
 * Official TMX inline tags stay as XML. Everything else is escaped.
 */
export function serializeSegContent(content: string) {
  let output = "";
  let index = 0;
  while (index < content.length) {
    if (content[index] === "<") {
      const inline = readInlineMarkup(content, index);
      if (inline) {
        output += inline.xml;
        index = inline.end;
        continue;
      }
    }
    const nextTag = content.indexOf("<", index + 1);
    const slice = nextTag === -1 ? content.slice(index) : content.slice(index, nextTag);
    output += escapeXmlText(slice);
    index = nextTag === -1 ? content.length : nextTag;
  }
  return output;
}

const XML_NAME = /^[A-Za-z:_][A-Za-z0-9:_.-]*/;
const XML_ENTITY = /^(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/;

type ParsedTag = {
  name: string;
  localName: string;
  closing: boolean;
  selfClosing: boolean;
  raw: string;
  end: number;
};

function localTagName(name: string) {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function parseXmlTag(content: string, start: number): ParsedTag | null {
  if (content[start] !== "<") {
    return null;
  }
  let index = start + 1;
  const closing = content[index] === "/";
  if (closing) {
    index += 1;
  }
  const nameMatch = XML_NAME.exec(content.slice(index));
  if (!nameMatch?.[0]) {
    return null;
  }
  const name = nameMatch[0];
  index += name.length;
  while (index < content.length) {
    const char = content[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === ">") {
      return {
        name,
        localName: localTagName(name).toLowerCase(),
        closing,
        selfClosing: false,
        raw: content.slice(start, index + 1),
        end: index + 1,
      };
    }
    if (char === "/" && content[index + 1] === ">") {
      if (closing) {
        return null;
      }
      return {
        name,
        localName: localTagName(name).toLowerCase(),
        closing: false,
        selfClosing: true,
        raw: content.slice(start, index + 2),
        end: index + 2,
      };
    }
    const attrName = XML_NAME.exec(content.slice(index));
    if (!attrName?.[0]) {
      return null;
    }
    index += attrName[0].length;
    while (
      content[index] === " " ||
      content[index] === "\t" ||
      content[index] === "\n" ||
      content[index] === "\r"
    ) {
      index += 1;
    }
    if (content[index] !== "=") {
      return null;
    }
    index += 1;
    while (
      content[index] === " " ||
      content[index] === "\t" ||
      content[index] === "\n" ||
      content[index] === "\r"
    ) {
      index += 1;
    }
    const quote = content[index];
    if (quote !== '"' && quote !== "'") {
      return null;
    }
    index += 1;
    while (index < content.length && content[index] !== quote) {
      if (content[index] === "<") {
        return null;
      }
      if (content[index] === "&") {
        const entity = XML_ENTITY.exec(content.slice(index + 1));
        if (!entity?.[0]) {
          return null;
        }
        index += 1 + entity[0].length;
        continue;
      }
      index += 1;
    }
    if (content[index] !== quote) {
      return null;
    }
    index += 1;
  }
  return null;
}

function readInlineMarkup(content: string, start: number): { xml: string; end: number } | null {
  const tag = parseXmlTag(content, start);
  if (!tag || !TMX_INLINE_ELEMENTS.has(tag.localName)) {
    return null;
  }
  if (tag.selfClosing || tag.closing) {
    return { xml: tag.raw, end: tag.end };
  }
  let index = tag.end;
  let depth = 1;
  while (index < content.length) {
    const nextOpen = content.indexOf("<", index);
    if (nextOpen === -1) {
      return null;
    }
    const next = parseXmlTag(content, nextOpen);
    if (!next || next.localName !== tag.localName) {
      index = nextOpen + 1;
      continue;
    }
    if (!next.closing && !next.selfClosing) {
      depth += 1;
      index = next.end;
      continue;
    }
    if (next.closing) {
      depth -= 1;
      if (depth === 0) {
        const inner = content.slice(tag.end, nextOpen);
        return {
          xml: `${tag.raw}${serializeSegContent(inner)}${next.raw}`,
          end: next.end,
        };
      }
    }
    index = next.end;
  }
  return null;
}

function writeProps(properties: TmxProperty[] | undefined, indent: string) {
  return (properties ?? [])
    .filter((property) => property.type && property.value)
    .map(
      (property) =>
        `${indent}<prop type="${escapeXmlAttr(property.type)}">${escapeXmlText(property.value)}</prop>`,
    );
}

function writeNotes(notes: string[] | undefined, indent: string) {
  return (notes ?? [])
    .filter((note) => note.trim().length > 0)
    .map((note) => `${indent}<note>${escapeXmlText(note)}</note>`);
}

type ExportTuv = {
  language: string;
  segment: string;
};

type ExportUnit = {
  tuid?: string;
  creationdate?: string;
  changedate?: string;
  creationid?: string;
  changeid?: string;
  properties?: TmxProperty[];
  notes?: string[];
  variants: ExportTuv[];
};

export type TmxSerializeInput = {
  header?: Partial<TmxHeader>;
  units: ExportUnit[];
};

export function serializeTmxHeaderXml(header?: Partial<TmxHeader>, fallbackSrclang?: string) {
  const srclang = header?.srclang?.trim() || fallbackSrclang || "en";
  const headerAttrs = [
    `creationtool="${escapeXmlAttr(header?.creationtool ?? "Hyperlocalise")}"`,
    `creationtoolversion="${escapeXmlAttr(header?.creationtoolversion ?? "1")}"`,
    `segtype="${escapeXmlAttr(header?.segtype ?? "sentence")}"`,
    `o-tmf="${escapeXmlAttr(header?.oTmf ?? "Hyperlocalise")}"`,
    `adminlang="${escapeXmlAttr(header?.adminlang ?? "en")}"`,
    `srclang="${escapeXmlAttr(srclang)}"`,
    `datatype="${escapeXmlAttr(header?.datatype ?? "plaintext")}"`,
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tmx version="1.4">`,
    `  <header ${headerAttrs.join(" ")}/>`,
    `  <body>`,
  ].join("\n");
}

export function serializeTmxUnitsXml(units: readonly ExportUnit[]) {
  return units
    .map((unit) => {
      const tuAttrs = [`tuid="${escapeXmlAttr(unit.tuid ?? "")}"`];
      if (unit.creationdate) tuAttrs.push(`creationdate="${escapeXmlAttr(unit.creationdate)}"`);
      if (unit.changedate) tuAttrs.push(`changedate="${escapeXmlAttr(unit.changedate)}"`);
      if (unit.creationid) tuAttrs.push(`creationid="${escapeXmlAttr(unit.creationid)}"`);
      if (unit.changeid) tuAttrs.push(`changeid="${escapeXmlAttr(unit.changeid)}"`);
      const lines = [`  <tu ${tuAttrs.join(" ")}>`];
      lines.push(...writeProps(unit.properties, "    "));
      lines.push(...writeNotes(unit.notes, "    "));
      for (const variant of unit.variants) {
        lines.push(
          `    <tuv xml:lang="${escapeXmlAttr(variant.language)}"><seg>${serializeSegContent(variant.segment)}</seg></tuv>`,
        );
      }
      lines.push("  </tu>");
      return lines.join("\n");
    })
    .join("\n");
}

export function serializeTmxFooterXml() {
  return `  </body>\n</tmx>\n`;
}

export function serializeTmxDocument(input: TmxSerializeInput) {
  const body = serializeTmxUnitsXml(input.units);
  return [
    serializeTmxHeaderXml(input.header, input.units[0]?.variants[0]?.language),
    body,
    serializeTmxFooterXml(),
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function metadataProps(metadata: Record<string, unknown> | undefined): TmxProperty[] {
  const tmx = metadata?.tmx;
  if (!tmx || typeof tmx !== "object" || Array.isArray(tmx)) {
    return [];
  }
  const props = (tmx as { props?: unknown }).props;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return [];
  }
  return Object.entries(props).flatMap(([type, value]) => {
    if (typeof value === "string") {
      return [{ type, value }];
    }
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => ({ type, value: item }));
    }
    return [];
  });
}

export function groupEntriesForTmxExport(entries: readonly TmxExportEntry[]) {
  const groups = new Map<string, ExportUnit>();
  for (const [index, entry] of entries.entries()) {
    const metadata = entry.metadata ?? {};
    const tuid = entry.tuid ?? asString(metadata.tuid);
    const groupKey = tuid
      ? `tuid:${tuid}`
      : `source:${entry.sourceLocale}\u0000${entry.sourceText}`;
    const existing = groups.get(groupKey);
    const sourceVariant = { language: entry.sourceLocale, segment: entry.sourceText };
    const targetVariant = { language: entry.targetLocale, segment: entry.targetText };
    if (!existing) {
      groups.set(groupKey, {
        tuid: tuid ?? `entry-${index + 1}`,
        creationdate: asString(metadata.creationdate),
        changedate: asString(metadata.changedate),
        creationid: asString(metadata.creationid),
        changeid: asString(metadata.changeid),
        properties: metadataProps(metadata),
        notes: asStringArray(metadata.notes),
        variants: [sourceVariant, targetVariant],
      });
      continue;
    }
    const hasSource = existing.variants.some(
      (variant) =>
        variant.language === sourceVariant.language && variant.segment === sourceVariant.segment,
    );
    if (!hasSource) {
      existing.variants.unshift(sourceVariant);
    }
    existing.variants.push(targetVariant);
  }
  return [...groups.values()];
}

export function serializeMemoryEntriesTmx(
  entries: readonly TmxExportEntry[],
  header?: Partial<TmxHeader>,
) {
  const units = groupEntriesForTmxExport(entries);
  const srclang = header?.srclang ?? entries[0]?.sourceLocale ?? "en";
  return serializeTmxDocument({
    header: { ...header, srclang },
    units,
  });
}
