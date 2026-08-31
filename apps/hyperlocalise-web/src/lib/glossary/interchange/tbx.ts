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
import { createHash } from "node:crypto";

import { SaxesParser, type SaxesTagNS } from "saxes";
import { create } from "xmlbuilder2";

import {
  diagnostic,
  type GlossaryImportDocument,
  type GlossaryInterchangeConcept,
  type GlossaryInterchangeDocument,
  type GlossaryInterchangeTerm,
  type InterchangeDiagnostic,
  type SerializationResult,
} from "./glossary-interchange";

export const TBX_NAMESPACE = "urn:iso:std:iso:30042:ed-2";
export const TBX_PROFILE = "TBX-Basic DCA";
const MAX_TBX_BYTES = 5_000_000;
const MAX_CONCEPTS = 50_000;
const MAX_TERMS = 250_000;

function textValue(value: string | undefined) {
  return value?.replace(/[ \t]+/g, " ").trim() ?? "";
}

function attr(tag: SaxesTagNS, name: string) {
  const value = tag.attributes[name] ?? tag.attributes[`xml:${name}`];
  return typeof value === "string" ? value : value?.value;
}

function stableId(prefix: string, value: string) {
  const base = value.replace(/[^A-Za-z0-9_.-]/g, "-");
  if (base === value && /^[A-Za-z_]/.test(base)) return `${prefix}-${base}`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    return `${prefix}-${value}`;
  }
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 10);
  return `${prefix}-${base || "entry"}-${digest}`;
}

function normalizeImportedId(value: string, prefix: "c" | "t") {
  const match = value.match(
    new RegExp(
      `^${prefix}-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`,
      "i",
    ),
  );
  return match?.[1] ?? value;
}

function containsInvalidXmlCharacters(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      (codePoint >= 0 && codePoint <= 8) ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    ) {
      return true;
    }
  }
  return false;
}

function mapStatusToTbx(status: string, warnings: InterchangeDiagnostic[], termId: string) {
  switch (status) {
    case "preferred":
      return "preferredTerm-admn-sts";
    case "admitted":
      return "admittedTerm-admn-sts";
    case "not_recommended":
      return "deprecatedTerm-admn-sts";
    case "obsolete":
      return "supersededTerm-admn-sts";
    case "draft":
      warnings.push(
        diagnostic({
          severity: "warning",
          code: "tbx_status_note",
          message: "Draft status was preserved as labeled metadata because DCA has no draft value.",
          termId,
          field: "status",
        }),
      );
      return null;
    default:
      warnings.push(
        diagnostic({
          severity: "warning",
          code: "unsupported_term_status",
          message: "The internal term status was preserved as labeled metadata.",
          termId,
          field: "status",
        }),
      );
      return null;
  }
}

const tbxPartOfSpeech = new Set(["adjective", "noun", "other", "verb", "adverb"]);
const partOfSpeechAliases: Record<string, string> = {
  adjective: "adjective",
  noun: "noun",
  verb: "verb",
  adverb: "adverb",
  other: "other",
};

const termTypeMap: Record<string, string> = {
  "full form": "fullForm",
  acronym: "acronym",
  abbreviation: "abbreviation",
  "short form": "shortForm",
  phrase: "phrase",
  variant: "variant",
};

function addNote(parent: ReturnType<ReturnType<typeof create>["ele"]>, value: string) {
  if (value.trim()) parent.ele("note").txt(value);
}

function addTerm(
  langSec: ReturnType<ReturnType<typeof create>["ele"]>,
  term: GlossaryInterchangeTerm,
  warnings: InterchangeDiagnostic[],
) {
  const termSec = langSec.ele("termSec", { id: stableId("t", term.id) });
  termSec.ele("term").txt(term.term);
  const notes: string[] = [];
  const addTermNote = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (serialized) notes.push(`[${label}]::${serialized}`);
  };
  if (term.partOfSpeech) {
    const mapped = partOfSpeechAliases[term.partOfSpeech];
    termSec
      .ele("termNote", { type: "partOfSpeech" })
      .txt(mapped && tbxPartOfSpeech.has(mapped) ? mapped : "other");
    if (!mapped || !tbxPartOfSpeech.has(mapped)) {
      addTermNote("Hyperlocalise::partOfSpeech", term.partOfSpeech);
    }
  }
  if (term.gender) {
    const gender = new Set(["masculine", "feminine", "neuter", "other"]).has(term.gender)
      ? term.gender
      : "other";
    termSec.ele("termNote", { type: "grammaticalGender" }).txt(gender);
    if (gender === "other" && term.gender !== "other") {
      addTermNote("Hyperlocalise::gender", term.gender);
    }
  }
  if (term.termType) {
    const mapped = termTypeMap[term.termType];
    if (mapped) termSec.ele("termNote", { type: "termType" }).txt(mapped);
    else addTermNote("Hyperlocalise::termType", term.termType);
  }
  const status = mapStatusToTbx(term.status, warnings, term.id);
  if (status) termSec.ele("termNote", { type: "administrativeStatus" }).txt(status);
  if (term.note.trim()) notes.push(term.note.trim());
  if (status === null) addTermNote("Hyperlocalise::status", term.status);
  if (term.caseSensitive) addTermNote("Hyperlocalise::caseSensitive", true);
  if (term.forbidden) addTermNote("Hyperlocalise::forbidden", true);
  addTermNote("Hyperlocalise::description", term.description);
  addTermNote("Hyperlocalise::lemma", term.lemma);
  addTermNote("Hyperlocalise::reviewStatus", term.reviewStatus);
  addTermNote("Hyperlocalise::provenance", term.provenance);
  addTermNote("Hyperlocalise::createdAt", term.createdAt);
  addTermNote("Hyperlocalise::updatedAt", term.updatedAt);
  addTermNote("Hyperlocalise::metadata", term.metadata);
  if (term.description.trim() || notes.length > 0) {
    if (term.description.trim()) {
      const descriptionGroup = termSec.ele("descripGrp");
      descriptionGroup.ele("descrip", { type: "context" }).txt(term.description.trim());
      if (notes.length > 0) descriptionGroup.ele("note").txt(notes.join("\n"));
    } else addNote(termSec, notes.join("\n"));
  }
  if (term.url) termSec.ele("xref", { type: "externalCrossReference", target: term.url });
}

function languageDetailNoteLines(
  languageDetail: GlossaryInterchangeConcept["languageDetails"][number],
) {
  return [
    languageDetail.note.trim(),
    languageDetail.userId === null
      ? ""
      : `[Hyperlocalise::languageUserId]::${JSON.stringify(languageDetail.userId)}`,
    languageDetail.createdAt
      ? `[Hyperlocalise::languageCreatedAt]::${languageDetail.createdAt}`
      : "",
    languageDetail.updatedAt
      ? `[Hyperlocalise::languageUpdatedAt]::${languageDetail.updatedAt}`
      : "",
  ].filter(Boolean);
}

function addConcept(
  body: ReturnType<ReturnType<typeof create>["ele"]>,
  concept: GlossaryInterchangeConcept,
  sourceLocale: string,
  warnings: InterchangeDiagnostic[],
  errors: InterchangeDiagnostic[],
) {
  if (concept.terms.length === 0) {
    errors.push(
      diagnostic({
        code: "concept_has_no_terms",
        message: "TBX-Basic requires at least one term for every concept.",
        conceptId: concept.id,
      }),
    );
    return;
  }
  const conceptEntry = body.ele("conceptEntry", { id: stableId("c", concept.id) });
  if (concept.subject) conceptEntry.ele("descrip", { type: "subjectField" }).txt(concept.subject);
  if (concept.definition)
    conceptEntry.ele("descrip", { type: "definition" }).txt(concept.definition);
  const conceptNotes = [
    concept.note.trim(),
    `[Hyperlocalise::translatable]::${JSON.stringify(concept.translatable)}`,
    concept.createdAt ? `[Hyperlocalise::createdAt]::${concept.createdAt}` : "",
    concept.updatedAt ? `[Hyperlocalise::updatedAt]::${concept.updatedAt}` : "",
    Object.keys(concept.metadata).length > 0
      ? `[Hyperlocalise::metadata]::${JSON.stringify(concept.metadata)}`
      : "",
  ].filter(Boolean);
  if (conceptNotes.length > 0) addNote(conceptEntry, conceptNotes.join("\n"));
  if (concept.url)
    conceptEntry.ele("xref", { type: "externalCrossReference", target: concept.url });
  if (concept.figure) conceptEntry.ele("xref", { type: "xGraphic", target: concept.figure });

  const termsByLocale = new Map<string, GlossaryInterchangeTerm[]>();
  for (const term of concept.terms) {
    if (!term.locale || !term.term) {
      errors.push(
        diagnostic({
          code: "term_missing_locale_or_text",
          message: "The term has no valid locale or text and cannot be represented in TBX.",
          conceptId: concept.id,
          termId: term.id,
        }),
      );
      continue;
    }
    termsByLocale.set(term.locale, [...(termsByLocale.get(term.locale) ?? []), term]);
  }
  for (const [locale, terms] of termsByLocale) {
    const langSec = conceptEntry.ele("langSec", { "xml:lang": locale });
    const languageDetail = concept.languageDetails.find((detail) => detail.locale === locale);
    if (languageDetail?.definition)
      langSec.ele("descrip", { type: "definition" }).txt(languageDetail.definition);
    if (languageDetail) {
      const noteLines = languageDetailNoteLines(languageDetail);
      if (noteLines.length > 0) addNote(langSec, noteLines.join("\n"));
    }
    for (const term of terms) addTerm(langSec, term, warnings);
  }
  if (!termsByLocale.has(sourceLocale)) {
    warnings.push(
      diagnostic({
        severity: "warning",
        code: "concept_has_no_source_locale",
        message: "The concept has no term in the glossary source locale.",
        conceptId: concept.id,
        field: "sourceLocale",
      }),
    );
  }
}

function parseLabeledNote(value: string) {
  const match = value.match(/^\[Hyperlocalise::([^\]]+)\]::([\s\S]*)$/u);
  if (!match) return null;
  const [, key, serialized] = match;
  if (!key) return null;
  try {
    return { key, value: JSON.parse(serialized) as unknown };
  } catch {
    return { key, value: serialized };
  }
}

function mergeLanguageDetailNote(
  concept: GlossaryImportDocument["concepts"][number],
  locale: string,
  value: string,
) {
  const existing = concept.languageDetails?.find((detail) => detail.locale === locale);
  let detail = {
    locale,
    definition: existing?.definition ?? "",
    note: existing?.note ?? "",
    userId: existing?.userId ?? null,
    createdAt: existing?.createdAt ?? null,
    updatedAt: existing?.updatedAt ?? null,
  };
  const plainNotes: string[] = [];
  for (const line of value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const labeled = parseLabeledNote(line);
    if (!labeled) {
      plainNotes.push(line);
      continue;
    }
    if (labeled.key === "languageUserId" && typeof labeled.value === "number")
      detail = { ...detail, userId: labeled.value };
    else if (labeled.key === "languageCreatedAt" && typeof labeled.value === "string")
      detail = { ...detail, createdAt: labeled.value };
    else if (labeled.key === "languageUpdatedAt" && typeof labeled.value === "string")
      detail = { ...detail, updatedAt: labeled.value };
    else plainNotes.push(line);
  }
  detail = { ...detail, note: [detail.note, ...plainNotes].filter(Boolean).join("\n") };
  concept.languageDetails = [
    ...(concept.languageDetails ?? []).filter((item) => item.locale !== locale),
    detail,
  ];
}

function applyTermLabeledNote(term: MutableTerm, labeled: { key: string; value: unknown }) {
  if (labeled.key === "partOfSpeech" && typeof labeled.value === "string")
    term.partOfSpeech = labeled.value;
  else if (labeled.key === "gender" && typeof labeled.value === "string")
    term.gender = labeled.value;
  else if (labeled.key === "termType" && typeof labeled.value === "string")
    term.termType = labeled.value;
  else if (labeled.key === "description" && typeof labeled.value === "string")
    term.description = labeled.value;
  else if (labeled.key === "lemma" && typeof labeled.value === "string") term.lemma = labeled.value;
  else if (labeled.key === "reviewStatus" && typeof labeled.value === "string")
    term.reviewStatus = labeled.value;
  else if (labeled.key === "provenance" && typeof labeled.value === "string")
    term.provenance = labeled.value;
  else if (labeled.key === "createdAt" && typeof labeled.value === "string")
    term.createdAt = labeled.value;
  else if (labeled.key === "updatedAt" && typeof labeled.value === "string")
    term.updatedAt = labeled.value;
  else if (labeled.key === "status" && typeof labeled.value === "string")
    term.status = labeled.value;
  else if (labeled.key === "caseSensitive" && typeof labeled.value === "boolean")
    term.caseSensitive = labeled.value;
  else if (labeled.key === "forbidden" && typeof labeled.value === "boolean")
    term.forbidden = labeled.value;
  else if (labeled.key === "metadata" && labeled.value && typeof labeled.value === "object")
    term.metadata = labeled.value as Record<string, unknown>;
  else return false;
  return true;
}

export function serializeTbx(document: GlossaryInterchangeDocument): SerializationResult {
  const warnings: InterchangeDiagnostic[] = [];
  const errors: InterchangeDiagnostic[] = [];
  if (document.concepts.length === 0) {
    errors.push(
      diagnostic({ code: "empty_glossary", message: "TBX-Basic requires at least one concept." }),
    );
  }
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_TBX_BYTES * 2) {
    errors.push(
      diagnostic({
        code: "export_too_large",
        message: `TBX export exceeds the ${MAX_TBX_BYTES}-byte safety limit.`,
      }),
    );
  }
  const conceptIds = new Set<string>();
  const termIds = new Set<string>();
  for (const concept of document.concepts) {
    const conceptXmlId = stableId("c", concept.id);
    if (conceptIds.has(conceptXmlId)) {
      errors.push(
        diagnostic({
          code: "duplicate_concept_id",
          message: "Multiple concepts resolve to the same XML-compatible ID.",
          conceptId: concept.id,
        }),
      );
    }
    conceptIds.add(conceptXmlId);
    for (const term of concept.terms) {
      const termXmlId = stableId("t", term.id);
      if (termIds.has(termXmlId)) {
        errors.push(
          diagnostic({
            code: "duplicate_term_id",
            message: "Multiple terms resolve to the same XML-compatible ID.",
            conceptId: concept.id,
            termId: term.id,
          }),
        );
      }
      termIds.add(termXmlId);
      const textFields = [
        term.term,
        term.description,
        term.note,
        term.partOfSpeech,
        term.gender ?? "",
        term.termType ?? "",
        term.lemma ?? "",
      ];
      if (textFields.some(containsInvalidXmlCharacters)) {
        errors.push(
          diagnostic({
            code: "invalid_xml_character",
            message: "A term contains a Unicode character that XML 1.0 cannot represent.",
            conceptId: concept.id,
            termId: term.id,
          }),
        );
      }
      if (term.url && !/^https?:\/\/.+/u.test(term.url)) {
        errors.push(
          diagnostic({
            code: "invalid_external_reference",
            message: "Term URLs must use HTTP or HTTPS to satisfy TBX DCA constraints.",
            conceptId: concept.id,
            termId: term.id,
            field: "url",
          }),
        );
      }
    }
    if (
      [
        concept.primaryTerm,
        concept.subject,
        concept.definition,
        concept.note,
        concept.url ?? "",
        concept.figure ?? "",
      ].some(containsInvalidXmlCharacters)
    ) {
      errors.push(
        diagnostic({
          code: "invalid_xml_character",
          message: "A concept contains a Unicode character that XML 1.0 cannot represent.",
          conceptId: concept.id,
        }),
      );
    }
    if (concept.url && !/^https?:\/\/.+/u.test(concept.url)) {
      errors.push(
        diagnostic({
          code: "invalid_external_reference",
          message: "Concept URLs must use HTTP or HTTPS to satisfy TBX DCA constraints.",
          conceptId: concept.id,
          field: "url",
        }),
      );
    }
  }
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("tbx", {
    xmlns: TBX_NAMESPACE,
    style: "dca",
    type: "TBX-Basic",
    "xml:lang": document.glossary.sourceLocale,
  });
  const header = root.ele("tbxHeader").ele("fileDesc");
  header.ele("titleStmt").ele("title").txt(document.glossary.name);
  header.ele("sourceDesc").ele("p").txt("Exported from Hyperlocalise");
  const body = root.ele("text").ele("body");
  for (const concept of document.concepts)
    addConcept(body, concept, document.glossary.sourceLocale, warnings, errors);
  if (errors.length > 0) return { content: new Uint8Array(), warnings, errors };
  const content = Buffer.from(root.end({ prettyPrint: true }), "utf8");
  if (content.byteLength > MAX_TBX_BYTES) {
    errors.push(
      diagnostic({
        code: "export_too_large",
        message: `TBX export exceeds the ${MAX_TBX_BYTES}-byte safety limit.`,
      }),
    );
    return { content: new Uint8Array(), warnings, errors };
  }
  return { content, warnings, errors };
}

type MutableTerm = Partial<GlossaryInterchangeTerm> & { id: string; locale: string; term: string };

export function parseTbx(content: string): GlossaryImportDocument {
  const diagnostics: InterchangeDiagnostic[] = [];
  if (Buffer.byteLength(content, "utf8") > MAX_TBX_BYTES) {
    return {
      concepts: [],
      diagnostics: [
        diagnostic({
          code: "file_too_large",
          message: `TBX input exceeds the ${MAX_TBX_BYTES}-byte limit.`,
        }),
      ],
    };
  }
  const concepts: GlossaryImportDocument["concepts"] = [];
  let currentConcept: GlossaryImportDocument["concepts"][number] | undefined;
  let currentLocale = "";
  let currentTerm: MutableTerm | undefined;
  const stack: Array<{ local: string; value: string; type?: string; target?: string }> = [];
  let termCount = 0;
  let conceptCount = 0;
  let parseError: Error | undefined;
  let rootValidated = false;
  const conceptIds = new Set<string>();
  const termIds = new Set<string>();
  const parser = new SaxesParser({ xmlns: true, fragment: false });

  parser.on("opentag", (tag) => {
    const local = tag.local ?? tag.name.split(":").pop() ?? tag.name;
    if (!rootValidated) {
      rootValidated = true;
      if (local !== "tbx" || tag.uri !== TBX_NAMESPACE) {
        diagnostics.push(
          diagnostic({
            code: "unsupported_tbx_namespace",
            message: "The document is not a TBX 3 document using the ISO 30042 namespace.",
          }),
        );
      }
      if (attr(tag, "type") !== "TBX-Basic" || attr(tag, "style") !== "dca") {
        diagnostics.push(
          diagnostic({
            code: "unsupported_tbx_profile",
            message: "Only the TBX-Basic dialect with DCA style is supported.",
          }),
        );
      }
    }
    stack.push({ local, value: "", type: attr(tag, "type"), target: attr(tag, "target") });
    if (local === "conceptEntry" || local === "termEntry") {
      conceptCount++;
      if (conceptCount > MAX_CONCEPTS) throw new Error("TBX concept limit exceeded");
      const id = normalizeImportedId(attr(tag, "id") ?? `import-${conceptCount}`, "c");
      if (!attr(tag, "id"))
        diagnostics.push(
          diagnostic({
            severity: "warning",
            code: "missing_concept_id",
            message: "Concept had no stable ID; a deterministic import ID was assigned.",
            conceptId: id,
          }),
        );
      currentConcept = { id, primaryTerm: "", terms: [] };
    } else if (local === "langSec" || local === "langSet") {
      currentLocale = attr(tag, "lang") ?? attr(tag, "xml:lang") ?? "";
    } else if (local === "termSec" || local === "tig") {
      currentTerm = {
        id: normalizeImportedId(attr(tag, "id") ?? `term-${conceptCount}-${termCount + 1}`, "t"),
        locale: currentLocale,
        term: "",
      };
    }
  });
  parser.on("text", (value) => {
    const frame = stack.at(-1);
    if (frame) frame.value += value;
  });
  parser.on("cdata", (value) => {
    const frame = stack.at(-1);
    if (frame) frame.value += value;
  });
  parser.on("closetag", () => {
    const frame = stack.pop();
    if (!frame) return;
    const parent = stack.at(-1);
    if (parent) parent.value += frame.value;
    const value = textValue(frame.value);
    if (!currentConcept) return;
    const concept = currentConcept;
    if (frame.local === "term" && currentTerm) currentTerm.term = value;
    else if (frame.local === "descrip") {
      if (currentTerm && frame.type === "context") currentTerm.description = value;
      else if (frame.type === "subject" || frame.type === "subjectField")
        currentConcept.subject = value;
      else if (frame.type === "definition") {
        if (currentLocale) {
          currentConcept.languageDetails = [
            ...(currentConcept.languageDetails ?? []).filter(
              (detail) => detail.locale !== currentLocale,
            ),
            {
              locale: currentLocale,
              definition: value,
              note: "",
              userId: null,
              createdAt: null,
              updatedAt: null,
            },
          ];
        } else if (currentTerm) currentTerm.description = value;
        else currentConcept.definition = value;
      }
    } else if (frame.local === "note") {
      const noteLines = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (currentTerm) {
        const plainNotes = noteLines.filter((line) => {
          const labeled = parseLabeledNote(line);
          return !labeled || !applyTermLabeledNote(currentTerm!, labeled);
        });
        if (plainNotes.length > 0)
          currentTerm.note = [currentTerm.note, ...plainNotes].filter(Boolean).join("\n");
      } else if (!currentLocale) {
        const plainNotes = noteLines.filter((line) => {
          const labeled = parseLabeledNote(line);
          if (!labeled) return true;
          if (labeled.key === "translatable" && typeof labeled.value === "boolean") {
            concept.translatable = labeled.value;
            return false;
          }
          if (/^external(?:Key|UserId|CreatedAt|UpdatedAt)$/u.test(labeled.key)) {
            diagnostics.push(
              diagnostic({
                severity: "warning",
                code: "unsupported_sync_metadata",
                message: "Provider sync metadata was ignored for native glossary import.",
                conceptId: concept.id,
                field: labeled.key,
              }),
            );
            return false;
          }
          if (labeled.key === "createdAt" && typeof labeled.value === "string") {
            concept.createdAt = labeled.value;
            return false;
          }
          if (labeled.key === "updatedAt" && typeof labeled.value === "string") {
            concept.updatedAt = labeled.value;
            return false;
          }
          if (labeled.key === "metadata" && labeled.value && typeof labeled.value === "object") {
            concept.metadata = labeled.value as Record<string, unknown>;
            return false;
          }
          return true;
        });
        if (plainNotes.length > 0)
          concept.note = [concept.note, ...plainNotes].filter(Boolean).join("\n");
      } else if (currentLocale) {
        mergeLanguageDetailNote(currentConcept, currentLocale, value);
      } else currentConcept.note = [currentConcept.note, value].filter(Boolean).join("\n");
    } else if (frame.local === "termNote" && currentTerm) {
      if (frame.type === "partOfSpeech") currentTerm.partOfSpeech = value;
      else if (frame.type === "grammaticalGender") currentTerm.gender = value;
      else if (frame.type === "termType")
        currentTerm.termType =
          Object.entries(termTypeMap).find(([, mapped]) => mapped === value)?.[0] ?? value;
      else if (frame.type === "administrativeStatus") {
        currentTerm.status =
          (
            {
              "preferredTerm-admn-sts": "preferred",
              "admittedTerm-admn-sts": "admitted",
              "deprecatedTerm-admn-sts": "not_recommended",
              "supersededTerm-admn-sts": "obsolete",
            } as Record<string, string>
          )[value] ?? "draft";
        if (value === "forbiddenTerm") currentTerm.forbidden = true;
      } else if (frame.type === "termLocation" && value === "case-sensitive")
        currentTerm.caseSensitive = true;
      else
        currentTerm.metadata = {
          ...currentTerm.metadata,
          [`tbx:${frame.type ?? "termNote"}`]: value,
        };
    } else if ((frame.local === "ref" || frame.local === "xref") && frame.target) {
      if (currentTerm) currentTerm.url = frame.target;
      else if (frame.type === "externalCrossReference") currentConcept.url = frame.target;
      else if (frame.type === "xGraphic") currentConcept.figure = frame.target;
    } else if ((frame.local === "termSec" || frame.local === "tig") && currentTerm) {
      if (!currentTerm.term || !currentTerm.locale) {
        diagnostics.push(
          diagnostic({
            code: "term_missing_locale_or_text",
            message: "Term section has no locale or term text.",
            conceptId: currentConcept.id,
            termId: currentTerm.id,
          }),
        );
      } else {
        termCount++;
        if (termCount > MAX_TERMS) throw new Error("TBX term limit exceeded");
        const term = {
          id: currentTerm.id,
          conceptId: currentConcept.id,
          locale: currentTerm.locale,
          term: currentTerm.term,
          description: currentTerm.description,
          note: currentTerm.note,
          partOfSpeech: currentTerm.partOfSpeech,
          gender: currentTerm.gender,
          termType: currentTerm.termType,
          url: currentTerm.url,
          lemma: currentTerm.lemma,
          status: currentTerm.status,
          caseSensitive: currentTerm.caseSensitive,
          forbidden: currentTerm.forbidden,
          provenance: currentTerm.provenance,
          reviewStatus: currentTerm.reviewStatus,
          metadata: currentTerm.metadata,
          createdAt: currentTerm.createdAt,
          updatedAt: currentTerm.updatedAt,
        };
        if (termIds.has(term.id))
          diagnostics.push(
            diagnostic({
              conceptId: currentConcept.id,
              termId: term.id,
              code: "duplicate_term_id",
              message: "The TBX document contains duplicate term IDs.",
            }),
          );
        termIds.add(term.id);
        currentConcept.terms.push(term);
        if (!currentConcept.primaryTerm) currentConcept.primaryTerm = term.term;
      }
      currentTerm = undefined;
    } else if (frame.local === "conceptEntry" || frame.local === "termEntry") {
      if (currentConcept) {
        if (!currentConcept.terms.length)
          diagnostics.push(
            diagnostic({
              code: "concept_has_no_terms",
              message: "Concept has no importable terms.",
              conceptId: currentConcept.id,
            }),
          );
        if (conceptIds.has(currentConcept.id))
          diagnostics.push(
            diagnostic({
              conceptId: currentConcept.id,
              code: "duplicate_concept_id",
              message: "The TBX document contains duplicate concept IDs.",
            }),
          );
        conceptIds.add(currentConcept.id);
        concepts.push(currentConcept);
      }
      currentConcept = undefined;
      currentLocale = "";
    }
  });
  parser.on("error", (error) => {
    parseError = error;
    parser.close();
  });
  try {
    parser.write(content).close();
  } catch (error) {
    parseError = error instanceof Error ? error : new Error(String(error));
  }
  if (parseError) {
    const isLimitError = /limit exceeded/u.test(parseError.message);
    diagnostics.push(
      diagnostic({
        code: isLimitError ? "entry_limit_exceeded" : "invalid_xml",
        message: isLimitError
          ? "The TBX document exceeds the configured concept or term limit."
          : "The TBX document is not well-formed XML.",
      }),
    );
  }
  return { concepts, diagnostics };
}
