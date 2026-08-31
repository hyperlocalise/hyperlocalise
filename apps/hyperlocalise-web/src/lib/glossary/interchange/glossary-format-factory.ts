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
import {
  type GlossaryImportDocument,
  type GlossaryInterchangeDocument,
  type SerializationResult,
} from "./glossary-interchange";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { parseTbx, serializeTbx } from "./tbx";
import { parseXlsx, serializeXlsx, XLSX_MIME_TYPE } from "./xlsx";

export type GlossaryFormat = "csv" | "tbx" | "xlsx";

export abstract class GlossaryFormatCodec {
  abstract readonly format: GlossaryFormat;
  abstract readonly extension: string;
  abstract readonly mimeType: string;

  abstract parse(input: string | Uint8Array): GlossaryImportDocument;

  abstract serialize(document: GlossaryInterchangeDocument): SerializationResult;
}

function parseCsv(content: string): GlossaryImportDocument {
  const rows = parseCsvRows(content);
  const [first, ...rest] = rows;
  const hasHeader = first?.some((cell) => /concept|locale|term|definition/i.test(cell)) ?? false;
  const headers = (
    hasHeader
      ? first
      : [
          "conceptId",
          "locale",
          "term",
          "subject",
          "definition",
          "translatable",
          "note",
          "url",
          "partOfSpeech",
          "gender",
          "termType",
          "status",
        ]
  ).map((header) => header.trim().toLowerCase());
  const concepts = new Map<string, GlossaryImportDocument["concepts"][number]>();
  for (const row of hasHeader ? rest : rows) {
    const values = new Map(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
    const term = values.get("term") ?? "";
    const locale = values.get("locale") ?? "";
    if (!term || !locale) continue;
    const id = values.get("conceptid") || term;
    const concept = concepts.get(id) ?? { id, primaryTerm: "", terms: [] };
    concept.primaryTerm ||= term;
    concept.subject ||= values.get("subject") || undefined;
    concept.definition ||= values.get("definition") || undefined;
    concept.note ||= values.get("note") || undefined;
    concept.url ||= values.get("url") || undefined;
    concept.terms.push({
      id: `${id}:${locale}:${concept.terms.length + 1}`,
      conceptId: id,
      locale,
      term,
      description: "",
      note: "",
      partOfSpeech: values.get("partofspeech") || "",
      gender: values.get("gender") || null,
      termType: values.get("termtype") || null,
      url: null,
      lemma: null,
      status: values.get("status") || "draft",
      caseSensitive: false,
      forbidden: false,
      provenance: "manual",
      reviewStatus: "approved",
      metadata: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    concepts.set(id, concept);
  }
  return { concepts: [...concepts.values()], diagnostics: [] };
}

class CsvGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "csv" as const;
  readonly extension = "csv";
  readonly mimeType = "text/csv; charset=utf-8";

  parse(input: string | Uint8Array) {
    return parseCsv(typeof input === "string" ? input : new TextDecoder().decode(input));
  }

  serialize() {
    return {
      content: new Uint8Array(),
      warnings: [],
      errors: [
        {
          severity: "error",
          code: "format_not_exportable",
          message: "CSV export is not supported by this codec.",
        },
      ],
    } satisfies SerializationResult;
  }
}

class TbxGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "tbx" as const;
  readonly extension = "tbx";
  readonly mimeType = "application/xml; charset=utf-8";

  parse(input: string | Uint8Array) {
    return parseTbx(typeof input === "string" ? input : new TextDecoder().decode(input));
  }

  serialize(document: GlossaryInterchangeDocument) {
    return serializeTbx(document);
  }
}

class XlsxGlossaryFormatCodec extends GlossaryFormatCodec {
  readonly format = "xlsx" as const;
  readonly extension = "xlsx";
  readonly mimeType = XLSX_MIME_TYPE;

  parse(input: string | Uint8Array) {
    return parseXlsx(
      typeof input === "string" ? Uint8Array.from(Buffer.from(input, "base64")) : input,
    );
  }

  serialize(document: GlossaryInterchangeDocument) {
    return serializeXlsx(document);
  }
}

const codecs: Record<GlossaryFormat, GlossaryFormatCodec> = {
  csv: new CsvGlossaryFormatCodec(),
  tbx: new TbxGlossaryFormatCodec(),
  xlsx: new XlsxGlossaryFormatCodec(),
};

export class GlossaryFormatFactory {
  static create(format: GlossaryFormat): GlossaryFormatCodec {
    return codecs[format];
  }
}

export function isGlossaryFormat(value: string): value is GlossaryFormat {
  return value === "csv" || value === "tbx" || value === "xlsx";
}
