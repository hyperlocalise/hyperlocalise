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
import * as XLSX from "xlsx";

import {
  diagnostic,
  type GlossaryImportDocument,
  type GlossaryInterchangeDocument,
  type InterchangeDiagnostic,
  type SerializationResult,
} from "./glossary-interchange";

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSX_CONCEPT_SHEET = "Concepts";
export const XLSX_TERM_SHEET = "Terms";
const MAX_XLSX_BYTES = 10_000_000;
const MAX_XLSX_ROWS = 250_000;

const conceptHeaders = [
  "conceptId",
  "primaryTerm",
  "subject",
  "definition",
  "translatable",
  "note",
  "url",
  "figure",
  "languageDetails",
  "metadata",
  "createdAt",
  "updatedAt",
];
const termHeaders = [
  "termId",
  "conceptId",
  "locale",
  "term",
  "description",
  "note",
  "partOfSpeech",
  "gender",
  "termType",
  "url",
  "lemma",
  "status",
  "caseSensitive",
  "forbidden",
  "provenance",
  "reviewStatus",
  "metadata",
  "createdAt",
  "updatedAt",
];

function cell(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value) ?? "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function optionalCell(row: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  const value = cell(row, key);
  return value || null;
}

function booleanCell(
  row: Record<string, unknown>,
  key: string,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string; termId?: string },
) {
  const value = cell(row, key);
  if (!value) return undefined;
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  diagnostics.push(
    diagnostic({
      ...ids,
      sourceRow: rowNumber,
      field: key,
      code: "invalid_boolean",
      message: `Column ${key} must be true or false.`,
    }),
  );
  return undefined;
}

function jsonCell(
  row: Record<string, unknown>,
  key: string,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string; termId?: string },
) {
  const value = cell(row, key);
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
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

function parseLanguageDetails(
  row: Record<string, unknown>,
  diagnostics: InterchangeDiagnostic[],
  rowNumber: number,
  ids: { conceptId?: string },
) {
  const value = cell(row, "languageDetails");
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("not array");
    return parsed
      .filter((item): item is { locale: string; definition?: string; note?: string } => {
        return Boolean(
          item && typeof item === "object" && "locale" in item && typeof item.locale === "string",
        );
      })
      .map((item) => ({
        locale: item.locale,
        definition: item.definition ?? "",
        note: item.note ?? "",
        userId: null,
        createdAt: null,
        updatedAt: null,
      }));
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

function asString(value: string | null | undefined) {
  return value ?? "";
}

export function serializeXlsx(document: GlossaryInterchangeDocument): SerializationResult {
  const concepts = document.concepts.map((concept) => ({
    conceptId: concept.id,
    primaryTerm: concept.primaryTerm,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: asString(concept.url),
    figure: asString(concept.figure),
    languageDetails: JSON.stringify(concept.languageDetails),
    metadata: JSON.stringify(concept.metadata),
    createdAt: concept.createdAt,
    updatedAt: concept.updatedAt,
  }));
  const terms = document.concepts.flatMap((concept) =>
    concept.terms.map((term) => ({
      termId: term.id,
      conceptId: concept.id,
      locale: term.locale,
      term: term.term,
      description: term.description,
      note: term.note,
      partOfSpeech: term.partOfSpeech,
      gender: asString(term.gender),
      termType: asString(term.termType),
      url: asString(term.url),
      lemma: asString(term.lemma),
      status: term.status,
      caseSensitive: term.caseSensitive,
      forbidden: term.forbidden,
      provenance: term.provenance,
      reviewStatus: term.reviewStatus,
      metadata: JSON.stringify(term.metadata),
      createdAt: term.createdAt,
      updatedAt: term.updatedAt,
    })),
  );
  const workbook = XLSX.utils.book_new();
  const conceptSheet = XLSX.utils.json_to_sheet(concepts, { header: conceptHeaders });
  const termSheet = XLSX.utils.json_to_sheet(terms, { header: termHeaders });
  XLSX.utils.book_append_sheet(workbook, conceptSheet, XLSX_CONCEPT_SHEET);
  XLSX.utils.book_append_sheet(workbook, termSheet, XLSX_TERM_SHEET);
  const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  if (content.byteLength > MAX_XLSX_BYTES) {
    return {
      content: new Uint8Array(),
      warnings: [],
      errors: [
        diagnostic({
          code: "export_too_large",
          message: `XLSX export exceeds the ${MAX_XLSX_BYTES}-byte safety limit.`,
        }),
      ],
    };
  }
  return { content, warnings: [], errors: [] };
}

export function parseXlsx(content: Uint8Array): GlossaryImportDocument {
  const diagnostics: InterchangeDiagnostic[] = [];
  if (content.byteLength > MAX_XLSX_BYTES) {
    return {
      concepts: [],
      diagnostics: [
        diagnostic({
          code: "file_too_large",
          message: `XLSX input exceeds the ${MAX_XLSX_BYTES}-byte limit.`,
        }),
      ],
    };
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(content, {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
    });
  } catch {
    return {
      concepts: [],
      diagnostics: [
        diagnostic({ code: "malformed_workbook", message: "The XLSX file could not be read." }),
      ],
    };
  }
  const conceptSheet = workbook.Sheets[XLSX_CONCEPT_SHEET];
  const termSheet = workbook.Sheets[XLSX_TERM_SHEET];
  if (!conceptSheet || !termSheet) {
    return {
      concepts: [],
      diagnostics: [
        diagnostic({
          code: "missing_workbook_sheet",
          message: `The workbook must contain ${XLSX_CONCEPT_SHEET} and ${XLSX_TERM_SHEET} sheets.`,
        }),
      ],
    };
  }
  const conceptRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(conceptSheet, {
    defval: "",
    raw: false,
  });
  const termRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(termSheet, {
    defval: "",
    raw: false,
  });
  if (conceptRows.length + termRows.length > MAX_XLSX_ROWS) {
    diagnostics.push(
      diagnostic({
        code: "entry_limit_exceeded",
        message: `The workbook exceeds the ${MAX_XLSX_ROWS}-row limit.`,
      }),
    );
  }
  const concepts = new Map<string, GlossaryImportDocument["concepts"][number]>();
  for (const [index, row] of conceptRows.entries()) {
    const rowNumber = index + 2;
    const id = cell(row, "conceptId");
    if (!id) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          code: "missing_concept_id",
          message: "Concept row requires conceptId.",
        }),
      );
      continue;
    }
    if (concepts.has(id)) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          conceptId: id,
          code: "duplicate_concept_id",
          message: "Concept ID appears more than once.",
        }),
      );
      continue;
    }
    concepts.set(id, {
      id,
      primaryTerm: cell(row, "primaryTerm") || undefined,
      subject: cell(row, "subject"),
      definition: cell(row, "definition"),
      translatable: booleanCell(row, "translatable", diagnostics, rowNumber, { conceptId: id }),
      note: cell(row, "note"),
      url: optionalCell(row, "url"),
      figure: optionalCell(row, "figure"),
      metadata: cell(row, "metadata")
        ? jsonCell(row, "metadata", diagnostics, rowNumber, { conceptId: id })
        : undefined,
      languageDetails: cell(row, "languageDetails")
        ? parseLanguageDetails(row, diagnostics, rowNumber, { conceptId: id })
        : undefined,
      createdAt: optionalCell(row, "createdAt") ?? undefined,
      updatedAt: optionalCell(row, "updatedAt") ?? undefined,
      terms: [],
    });
  }
  for (const [index, row] of termRows.entries()) {
    const rowNumber = index + 2;
    const conceptId = cell(row, "conceptId");
    const termId = cell(row, "termId");
    const locale = cell(row, "locale");
    const termText = cell(row, "term");
    if (!conceptId || !termId || !locale || !termText) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          conceptId: conceptId || undefined,
          termId: termId || undefined,
          code: "incomplete_term_row",
          message: "Term row requires termId, conceptId, locale, and term.",
        }),
      );
      continue;
    }
    const concept = concepts.get(conceptId);
    if (!concept) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          conceptId,
          termId,
          code: "orphan_term",
          message: "Term references a concept that is not present in the Concepts sheet.",
        }),
      );
      continue;
    }
    if (concept.terms.some((candidate) => candidate.id === termId)) {
      diagnostics.push(
        diagnostic({
          sourceRow: rowNumber,
          conceptId,
          termId,
          code: "duplicate_term_id",
          message: "Term ID appears more than once for a concept.",
        }),
      );
      continue;
    }
    const term: GlossaryImportDocument["concepts"][number]["terms"][number] = {
      id: termId,
      conceptId,
      locale,
      term: termText,
      description: cell(row, "description") || undefined,
      note: cell(row, "note") || undefined,
      partOfSpeech: cell(row, "partOfSpeech") || undefined,
      gender: optionalCell(row, "gender"),
      termType: optionalCell(row, "termType"),
      url: optionalCell(row, "url"),
      lemma: optionalCell(row, "lemma"),
      status: cell(row, "status") || undefined,
      caseSensitive: booleanCell(row, "caseSensitive", diagnostics, rowNumber, {
        conceptId,
        termId,
      }),
      forbidden: booleanCell(row, "forbidden", diagnostics, rowNumber, { conceptId, termId }),
      provenance: cell(row, "provenance") || undefined,
      reviewStatus: cell(row, "reviewStatus") || undefined,
      metadata: cell(row, "metadata")
        ? jsonCell(row, "metadata", diagnostics, rowNumber, { conceptId, termId })
        : undefined,
      createdAt: cell(row, "createdAt") || undefined,
      updatedAt: cell(row, "updatedAt") || undefined,
    };
    concept.terms.push(term);
  }
  for (const concept of concepts.values()) {
    if (!concept.terms.length)
      diagnostics.push(
        diagnostic({
          conceptId: concept.id,
          code: "concept_has_no_terms",
          message: "Concept has no valid term rows.",
        }),
      );
  }
  return { concepts: [...concepts.values()], diagnostics };
}
