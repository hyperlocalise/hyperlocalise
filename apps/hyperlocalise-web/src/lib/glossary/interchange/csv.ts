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
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import {
  diagnostic,
  type GlossaryImportDocument,
  type GlossaryInterchangeDocument,
  type GlossaryInterchangeTerm,
  type InterchangeDiagnostic,
  type SerializationResult,
} from "./glossary-interchange";

export const CSV_MIME_TYPE = "text/csv; charset=utf-8";
const MAX_CSV_BYTES = 10_000_000;
const MAX_CSV_ROWS = 250_000;

const csvHeaders = [
  "conceptId",
  "termId",
  "locale",
  "term",
  "primaryTerm",
  "subject",
  "definition",
  "translatable",
  "conceptNote",
  "conceptUrl",
  "figure",
  "languageDetails",
  "conceptMetadata",
  "conceptCreatedAt",
  "conceptUpdatedAt",
  "description",
  "termNote",
  "partOfSpeech",
  "gender",
  "termType",
  "termUrl",
  "lemma",
  "status",
  "caseSensitive",
  "forbidden",
  "provenance",
  "reviewStatus",
  "termMetadata",
  "createdAt",
  "updatedAt",
];

function csvCell(value: unknown) {
  let text = "";
  if (typeof value === "string") text = value;
  else if (typeof value === "number") text = value.toString();
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else if (value !== null && value !== undefined) text = JSON.stringify(value) ?? "";
  return `"${text.replaceAll('"', '""')}"`;
}

function jsonValue(value: unknown) {
  return JSON.stringify(value) ?? "{}";
}

function rowForTerm(
  concept: GlossaryInterchangeDocument["concepts"][number],
  term: GlossaryInterchangeTerm,
) {
  return [
    concept.id,
    term.id,
    term.locale,
    term.term,
    concept.primaryTerm,
    concept.subject,
    concept.definition,
    concept.translatable,
    concept.note,
    concept.url,
    concept.figure,
    jsonValue(concept.languageDetails),
    jsonValue(concept.metadata),
    concept.createdAt,
    concept.updatedAt,
    term.description,
    term.note,
    term.partOfSpeech,
    term.gender,
    term.termType,
    term.url,
    term.lemma,
    term.status,
    term.caseSensitive,
    term.forbidden,
    term.provenance,
    term.reviewStatus,
    jsonValue(term.metadata),
    term.createdAt,
    term.updatedAt,
  ];
}

export function serializeCsv(document: GlossaryInterchangeDocument): SerializationResult {
  const rows = [
    csvHeaders,
    ...document.concepts.flatMap((concept) =>
      concept.terms.map((term) => rowForTerm(concept, term)),
    ),
  ];
  const content = new TextEncoder().encode(
    `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`,
  );
  if (content.byteLength > MAX_CSV_BYTES) {
    return {
      content: new Uint8Array(),
      warnings: [],
      errors: [
        diagnostic({
          code: "export_too_large",
          message: `CSV export exceeds the ${MAX_CSV_BYTES}-byte safety limit.`,
        }),
      ],
    };
  }
  return { content, warnings: [], errors: [] };
}

function value(row: Map<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = row.get(key.toLowerCase());
    if (found) return found;
  }
  return "";
}

function optionalValue(row: Map<string, string>, ...keys: string[]) {
  const key = keys
    .map((candidate) => candidate.toLowerCase())
    .find((candidate) => row.has(candidate));
  if (!key) return undefined;
  return row.get(key) || null;
}

function booleanValue(
  row: Map<string, string>,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string; termId?: string },
  ...keys: string[]
) {
  const raw = value(row, ...keys);
  if (!raw) return undefined;
  if (/^(true|1|yes)$/iu.test(raw)) return true;
  if (/^(false|0|no)$/iu.test(raw)) return false;
  diagnostics.push(
    diagnostic({
      ...ids,
      sourceRow: rowNumber,
      field: keys[0],
      code: "invalid_boolean",
      message: `Column ${keys[0]} must contain a true or false value.`,
    }),
  );
  return undefined;
}

function jsonObjectValue(
  row: Map<string, string>,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string; termId?: string },
  key: string,
) {
  const raw = value(row, key);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    diagnostics.push(
      diagnostic({
        ...ids,
        sourceRow: rowNumber,
        field: key,
        code: "invalid_json_metadata",
        message: `Column ${key} must contain a JSON object.`,
      }),
    );
    return {};
  }
}

function languageDetailsValue(
  row: Map<string, string>,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string },
) {
  const raw = value(row, "languageDetails");
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || !("locale" in item)) return [];
      const candidate = item as { locale?: unknown; definition?: unknown; note?: unknown };
      return typeof candidate.locale === "string"
        ? [
            {
              locale: candidate.locale,
              definition: typeof candidate.definition === "string" ? candidate.definition : "",
              note: typeof candidate.note === "string" ? candidate.note : "",
              userId: null,
              createdAt: null,
              updatedAt: null,
            },
          ]
        : [];
    });
  } catch {
    diagnostics.push(
      diagnostic({
        ...ids,
        sourceRow: rowNumber,
        field: "languageDetails",
        code: "invalid_language_details",
        message: "languageDetails must contain a JSON array of locale records.",
      }),
    );
    return [];
  }
}

export function parseCsv(content: string): GlossaryImportDocument {
  const diagnostics: InterchangeDiagnostic[] = [];
  if (new TextEncoder().encode(content).byteLength > MAX_CSV_BYTES) {
    return {
      concepts: [],
      diagnostics: [
        diagnostic({
          code: "file_too_large",
          message: `CSV input exceeds the ${MAX_CSV_BYTES}-byte limit.`,
        }),
      ],
    };
  }
  const rows = parseCsvRows(content);
  if (rows.length > MAX_CSV_ROWS) {
    diagnostics.push(
      diagnostic({
        code: "entry_limit_exceeded",
        message: `CSV input exceeds the ${MAX_CSV_ROWS}-row limit.`,
      }),
    );
  }
  const [first, ...rest] = rows;
  if (!first) return { concepts: [], diagnostics };
  const hasHeader = first.some((cell) => /concept|locale|term|definition/iu.test(cell));
  const headers = (hasHeader ? first : ["conceptId", "locale", "term"]).map((header) =>
    header.trim().toLowerCase(),
  );
  const concepts = new Map<string, GlossaryImportDocument["concepts"][number]>();
  for (const [index, cells] of (hasHeader ? rest : rows).entries()) {
    const rowNumber = hasHeader ? index + 2 : index + 1;
    const row = new Map(
      headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]),
    );
    const locale = value(row, "locale");
    const termText = value(row, "term");
    const conceptId = value(row, "conceptId", "conceptKey") || termText;
    const termId = value(row, "termId") || `${conceptId}:${locale}:${index + 1}`;
    if (!conceptId || !locale || !termText) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          conceptId: conceptId || undefined,
          termId: termId || undefined,
          code: "incomplete_term_row",
          message: "CSV rows require conceptId, locale, and term.",
        }),
      );
      continue;
    }
    const concept =
      concepts.get(conceptId) ??
      ({
        id: conceptId,
        primaryTerm: value(row, "primaryTerm") || undefined,
        subject: value(row, "subject") || undefined,
        definition: value(row, "definition") || undefined,
        translatable: booleanValue(row, diagnostics, rowNumber, { conceptId }, "translatable"),
        note: value(row, "conceptNote", "note") || undefined,
        url: optionalValue(row, "conceptUrl", "url"),
        figure: optionalValue(row, "figure"),
        languageDetails: value(row, "languageDetails")
          ? languageDetailsValue(row, diagnostics, rowNumber, { conceptId })
          : undefined,
        metadata: value(row, "conceptMetadata")
          ? jsonObjectValue(row, diagnostics, rowNumber, { conceptId }, "conceptMetadata")
          : undefined,
        createdAt: optionalValue(row, "conceptCreatedAt") ?? undefined,
        updatedAt: optionalValue(row, "conceptUpdatedAt") ?? undefined,
        terms: [],
      } satisfies GlossaryImportDocument["concepts"][number]);
    if (
      concepts.has(conceptId) &&
      value(row, "primaryTerm") &&
      concept.primaryTerm !== value(row, "primaryTerm")
    ) {
      diagnostics.push(
        diagnostic({
          severity: "warning",
          sourceRow: rowNumber,
          conceptId,
          code: "repeated_concept_metadata_differs",
          message: "Repeated concept metadata differs; the first concept row was retained.",
        }),
      );
    }
    concept.terms.push({
      id: termId,
      conceptId,
      locale,
      term: termText,
      description: value(row, "description") || undefined,
      note: value(row, "termNote", "note") || undefined,
      partOfSpeech: value(row, "partOfSpeech") || undefined,
      gender: optionalValue(row, "gender"),
      termType: optionalValue(row, "termType"),
      url: optionalValue(row, "termUrl", "url"),
      lemma: optionalValue(row, "lemma"),
      status: value(row, "status") || undefined,
      caseSensitive: booleanValue(
        row,
        diagnostics,
        rowNumber,
        { conceptId, termId },
        "caseSensitive",
      ),
      forbidden: booleanValue(row, diagnostics, rowNumber, { conceptId, termId }, "forbidden"),
      provenance: value(row, "provenance") || undefined,
      reviewStatus: value(row, "reviewStatus") || undefined,
      metadata: value(row, "termMetadata")
        ? jsonObjectValue(row, diagnostics, rowNumber, { conceptId, termId }, "termMetadata")
        : undefined,
      createdAt: value(row, "createdAt") || undefined,
      updatedAt: value(row, "updatedAt") || undefined,
    });
    concepts.set(conceptId, concept);
  }
  return { concepts: [...concepts.values()], diagnostics };
}
