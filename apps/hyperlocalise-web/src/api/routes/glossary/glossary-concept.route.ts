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
import { Hono } from "hono";
import { DomUtils, parseDocument } from "htmlparser2";
import { validator } from "hono/validator";

import { conflictResponse, badRequestResponse } from "@/api/errors";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import {
  GlossaryValidationError,
  selectGlossaryPrimaryTerm,
  type NativeGlossary,
  type GlossaryConcept,
} from "@/lib/glossary/glossary";

import {
  createGlossaryConceptBodySchema,
  createGlossaryConceptTermBodySchema,
  glossaryIdParamsSchema,
  glossaryConceptIdParamsSchema,
  glossaryConceptTermIdParamsSchema,
  importGlossaryTermsBodySchema,
  updateGlossaryConceptBodySchema,
  updateGlossaryConceptTermBodySchema,
  type CreateGlossaryConceptTermBody,
  type UpdateGlossaryConceptBody,
  type UpdateGlossaryConceptTermBody,
} from "./glossary.schema";
import {
  externalTmsGlossaryImmutableResponse,
  forbiddenResponse,
  getOwnedGlossary,
  glossaryNotFoundResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryMutationAllowed,
  nativeGlossaryConceptsOnlyResponse,
} from "./glossary.shared";

function crowdinStatus(status: string | undefined) {
  switch (status) {
    case "preferred":
      return "preferred";
    case "admitted":
      return "admitted";
    case "draft":
      return "draft";
    case "not_recommended":
      return "not recommended";
    case "obsolete":
      return "obsolete";
    default:
      return "draft";
  }
}

function localStatus(status: string | null | undefined) {
  const normalized = status?.toLowerCase();
  switch (normalized) {
    case "preferred":
      return "preferred";
    case "admitted":
      return "admitted";
    case "draft":
      return "draft";
    case "not recommended":
    case "not_recommended":
      return "not_recommended";
    case "obsolete":
      return "obsolete";
    default:
      return "draft";
  }
}

function glossaryValidationErrorResponse(
  c: Parameters<typeof badRequestResponse>[0],
  error: unknown,
) {
  if (!(error instanceof GlossaryValidationError)) return null;
  return badRequestResponse(c, error.code, error.message);
}

function toCrowdinTermRecord(
  glossary: NativeGlossary,
  conceptId: string,
  term: {
    id?: number | string;
    locale: string;
    text: string;
    description?: string | null;
    partOfSpeech?: string | null;
    status?: string | null;
    note?: string | null;
    type?: string | null;
    gender?: string | null;
    url?: string | null;
    lemma?: string | null;
    userId?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  },
) {
  const createdAt = term.createdAt ?? new Date(0).toISOString();
  const updatedAt = term.updatedAt ?? new Date(0).toISOString();
  return {
    id: String(term.id),
    glossaryId: glossary.id,
    conceptId,
    locale: term.locale,
    term: term.text,
    isPrimary: term.locale === glossary.sourceLocale,
    description: term.description ?? "",
    note: term.note ?? "",
    partOfSpeech: term.partOfSpeech ?? "",
    gender: term.gender ?? null,
    termType: term.type ?? null,
    url: term.url ?? null,
    lemma: term.lemma ?? null,
    status: localStatus(term.status),
    caseSensitive: false,
    forbidden: false,
    provenance: "sync",
    externalKey: String(term.id),
    reviewStatus: "draft",
    externalUserId: term.userId == null ? null : String(term.userId),
    externalCreatedAt: createdAt,
    externalUpdatedAt: updatedAt,
    createdAt,
    updatedAt,
  };
}

function toCrowdinConceptRecord(
  glossary: NativeGlossary,
  value: {
    conceptId?: number;
    id?: number | string;
    subject?: string | null;
    definition?: string | null;
    translatable?: boolean | null;
    note?: string | null;
    url?: string | null;
    figure?: string | null;
    externalKey?: string;
    externalUserId?: string | null;
    languageDetails?: Array<{
      locale: string;
      userId?: number | null;
      definition?: string | null;
      note?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
    externalCreatedAt?: string | null;
    externalUpdatedAt?: string | null;
    terms: Array<{
      id?: number | string;
      locale: string;
      text: string;
      description?: string | null;
      partOfSpeech?: string | null;
      status?: string | null;
      note?: string | null;
      type?: string | null;
      gender?: string | null;
      url?: string | null;
      lemma?: string | null;
      userId?: number | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }>;
  },
) {
  const conceptId = String(value.externalKey ?? value.id ?? value.conceptId);
  const createdAt = value.externalCreatedAt ?? new Date(0).toISOString();
  const updatedAt = value.externalUpdatedAt ?? new Date(0).toISOString();
  const source = selectGlossaryPrimaryTerm(value.terms, glossary.sourceLocale) ?? value.terms[0];
  return {
    id: conceptId,
    glossaryId: glossary.id,
    primaryTerm: source?.text ?? "",
    subject: value.subject ?? source?.partOfSpeech ?? "",
    definition: value.definition ?? source?.description ?? "",
    translatable: value.translatable ?? true,
    note: value.note ?? source?.note ?? "",
    url: value.url ?? null,
    figure: value.figure ?? null,
    externalKey: conceptId,
    externalUserId: value.externalUserId ?? null,
    languageDetails: (value.languageDetails ?? []).map((detail) => ({
      locale: detail.locale,
      userId: detail.userId ?? null,
      definition: detail.definition ?? "",
      note: detail.note ?? "",
      createdAt: detail.createdAt ?? null,
      updatedAt: detail.updatedAt ?? null,
    })),
    externalCreatedAt: createdAt,
    externalUpdatedAt: updatedAt,
    createdAt,
    updatedAt,
    terms: value.terms.map((term) => toCrowdinTermRecord(glossary, conceptId, term)),
  };
}

function validateConceptParams(value: unknown, c: Parameters<typeof glossaryNotFoundResponse>[0]) {
  const parsed = glossaryConceptIdParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : glossaryNotFoundResponse(c);
}

function validateGlossaryParams(value: unknown, c: Parameters<typeof glossaryNotFoundResponse>[0]) {
  const parsed = glossaryIdParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : glossaryNotFoundResponse(c);
}

function validateConceptTermParams(
  value: unknown,
  c: Parameters<typeof glossaryNotFoundResponse>[0],
) {
  const parsed = glossaryConceptTermIdParamsSchema.safeParse(value);
  return parsed.success ? parsed.data : glossaryNotFoundResponse(c);
}

function validateJson<T>(
  schemaToUse: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
  c: Parameters<typeof invalidGlossaryPayloadResponse>[0],
) {
  const parsed = schemaToUse.safeParse(value);
  return parsed.success ? parsed.data : invalidGlossaryPayloadResponse(c);
}

type ConceptImportEntry = {
  conceptKey: string;
  locale: string;
  term: string;
  subject?: string;
  definition?: string;
  translatable?: boolean;
  note?: string;
  url?: string;
  partOfSpeech?: string;
  gender?: string | null;
  termType?: string | null;
  status?: "preferred" | "draft" | "not_recommended";
};

function decodeXml(value: string) {
  return DomUtils.textContent(
    parseDocument(value, {
      decodeEntities: true,
      xmlMode: true,
    }),
  ).trim();
}

function parseConceptImport(content: string, format: "csv" | "tbx"): ConceptImportEntry[] {
  if (format === "csv") {
    const rows = parseCsvRows(content);
    const [first, ...rest] = rows;
    const hasHeader = first?.some((cell) => /concept|locale|term|definition/i.test(cell)) ?? false;
    const headers = (
      hasHeader
        ? first
        : [
            "conceptKey",
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
    const dataRows = hasHeader ? rest : rows;

    return dataRows.flatMap((row) => {
      const values = new Map(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
      const locale = values.get("locale") ?? "";
      const term = values.get("term") ?? "";
      if (!locale || !term) return [];
      const status = values.get("status");
      return [
        {
          conceptKey: values.get("conceptkey") || term,
          locale,
          term,
          subject: values.get("subject"),
          definition: values.get("definition"),
          translatable: values.get("translatable")
            ? values.get("translatable") !== "false"
            : undefined,
          note: values.get("note"),
          url: values.get("url"),
          partOfSpeech: values.get("partofspeech"),
          gender: values.get("gender") || null,
          termType: values.get("termtype") || null,
          status:
            status === "preferred" || status === "not_recommended" || status === "draft"
              ? status
              : undefined,
        } satisfies ConceptImportEntry,
      ];
    });
  }

  return [...content.matchAll(/<termEntry\b([^>]*)>([\s\S]*?)<\/termEntry>/gi)].flatMap(
    ([, attributes, body]) => {
      const conceptKey = attributes?.match(/(?:id|key)=["']([^"']+)["']/i)?.[1] ?? "";
      const subject = body?.match(
        /<descrip\b[^>]*type=["']subject[^"']*["'][^>]*>([\s\S]*?)<\/descrip>/i,
      )?.[1];
      const definition = body?.match(
        /<descrip\b[^>]*type=["']definition[^"']*["'][^>]*>([\s\S]*?)<\/descrip>/i,
      )?.[1];
      const terms = [
        ...(body ?? "").matchAll(
          /<langSet\b[^>]*(?:xml:lang|lang)=["']([^"']+)["'][^>]*>[\s\S]*?<term[^>]*>([\s\S]*?)<\/term>[\s\S]*?<\/langSet>/gi,
        ),
      ];
      return terms.flatMap(([, locale, term]) => {
        const decodedTerm = decodeXml(term ?? "");
        return decodedTerm && locale
          ? [
              {
                conceptKey: conceptKey || decodedTerm,
                locale: decodeXml(locale),
                term: decodedTerm,
                subject: subject ? decodeXml(subject) : undefined,
                definition: definition ? decodeXml(definition) : undefined,
              } satisfies ConceptImportEntry,
            ]
          : [];
      });
    },
  );
}

export function createGlossaryConceptRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/", validator("param", validateGlossaryParams), async (c) => {
      const { glossaryId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return c.json({ concepts: [], total: 0 }, 200);
      const concepts = await product.listConcepts();
      return c.json(
        {
          concepts: concepts.map((concept) => toCrowdinConceptRecord(glossary, concept)),
          total: concepts.length,
        },
        200,
      );
    })
    .post(
      "/",
      validator("param", validateGlossaryParams),
      validator("json", (value, c) => validateJson(createGlossaryConceptBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId } = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        let created;
        try {
          created = await product.createConcept(payload);
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (!created) return conflictResponse(c, "duplicate_glossary_concept_term");
        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryTermCreated, {
          status: "created",
          source: "glossary_concept",
        });
        return c.json({ concept: toCrowdinConceptRecord(glossary, created) }, 201);
      },
    )
    .post(
      "/import",
      validator("param", validateGlossaryParams),
      validator("json", (value, c) => validateJson(importGlossaryTermsBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId } = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const entries = parseConceptImport(payload.content, payload.format).slice(0, 10_000);
        const { concepts: importedConcepts, skipped } = await product.importConcepts(entries);
        return c.json(
          {
            concepts: importedConcepts.map((concept) => toCrowdinConceptRecord(glossary, concept)),
            imported: importedConcepts.length,
            skipped,
          },
          201,
        );
      },
    )
    .get("/:conceptId", validator("param", validateConceptParams), async (c) => {
      const { glossaryId, conceptId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return nativeGlossaryConceptsOnlyResponse(c);
      const concept = await product.getConcept(conceptId);
      if (!concept) return glossaryNotFoundResponse(c);
      return c.json({ concept: toCrowdinConceptRecord(glossary, concept) }, 200);
    })
    .patch(
      "/:conceptId",
      validator("param", validateConceptParams),
      validator("json", (value, c) => validateJson(updateGlossaryConceptBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId, conceptId } = c.req.valid("param");
        const payload = c.req.valid("json") as UpdateGlossaryConceptBody;
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const current = await product.getConcept(conceptId);
        if (!current) return glossaryNotFoundResponse(c);
        const merged = {
          ...current,
          ...payload,
          terms:
            payload.terms === undefined
              ? current.terms
              : payload.terms.map((term) => {
                  const existing = term.id
                    ? current.terms.find((candidate) => String(candidate.id) === term.id)
                    : undefined;
                  return {
                    id: term.id ?? existing?.id,
                    locale: term.locale,
                    text: term.term,
                    description: term.description ?? existing?.description,
                    note: term.note ?? existing?.note,
                    partOfSpeech: term.partOfSpeech ?? existing?.partOfSpeech,
                    status: term.status ?? existing?.status,
                    type: term.termType ?? existing?.type,
                    gender:
                      term.gender !== undefined ? (term.gender ?? undefined) : existing?.gender,
                    url: term.url !== undefined ? (term.url ?? undefined) : existing?.url,
                    lemma: term.lemma !== undefined ? (term.lemma ?? undefined) : existing?.lemma,
                  };
                }),
        } satisfies GlossaryConcept;
        let updated;
        try {
          updated = await product.updateConcept(conceptId, merged);
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (!updated) return glossaryNotFoundResponse(c);
        return c.json({ concept: toCrowdinConceptRecord(glossary, updated) }, 200);
      },
    )
    .delete("/:conceptId", validator("param", validateConceptParams), async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
      const { glossaryId, conceptId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return externalTmsGlossaryImmutableResponse(c);
      const deleted = await product.deleteConcept(conceptId);
      if (!deleted) return glossaryNotFoundResponse(c);
      return c.body(null, 204);
    })
    .get("/:conceptId/terms", validator("param", validateConceptParams), async (c) => {
      const { glossaryId, conceptId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return nativeGlossaryConceptsOnlyResponse(c);
      const concept = await product.getConcept(conceptId);
      if (!concept) return glossaryNotFoundResponse(c);
      const terms = toCrowdinConceptRecord(glossary, concept).terms;
      return c.json({ terms, total: terms.length }, 200);
    })
    .post(
      "/:conceptId/terms",
      validator("param", validateConceptParams),
      validator("json", (value, c) => validateJson(createGlossaryConceptTermBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId, conceptId } = c.req.valid("param");
        const payload = c.req.valid("json") as CreateGlossaryConceptTermBody;
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const concept = await product.getConcept(conceptId);
        if (!concept) return glossaryNotFoundResponse(c);
        let term;
        try {
          term = await product.createTerm(conceptId, {
            locale: payload.locale,
            text: payload.term,
            description: payload.description,
            note: payload.note,
            partOfSpeech: payload.partOfSpeech,
            status: crowdinStatus(payload.status),
            type: payload.termType ?? undefined,
            gender: payload.gender ?? undefined,
            url: payload.url ?? undefined,
            lemma: payload.lemma ?? undefined,
          });
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (term && "terms" in term) return conflictResponse(c, "glossary_term_create_failed");
        if (!term)
          return conflictResponse(
            c,
            "duplicate_glossary_concept_term",
            "A term with this locale and text already exists",
          );
        return c.json({ term: toCrowdinTermRecord(glossary, conceptId, term) }, 201);
      },
    )
    .patch(
      "/:conceptId/terms/:termId",
      validator("param", validateConceptTermParams),
      validator("json", (value, c) => validateJson(updateGlossaryConceptTermBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId, conceptId, termId } = c.req.valid("param");
        const payload = c.req.valid("json") as UpdateGlossaryConceptTermBody;
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const current = await product.getConcept(conceptId);
        const existing = current?.terms.find((term) => String(term.id) === termId);
        if (!existing) return glossaryNotFoundResponse(c);
        if (payload.locale && payload.locale !== existing.locale) {
          const currentIsPrimary = existing.locale === glossary.sourceLocale;
          if (currentIsPrimary) {
            return badRequestResponse(
              c,
              "source_term_locale_immutable",
              "The primary term must stay in the glossary source locale",
            );
          }
        }
        const nextPartOfSpeech = payload.partOfSpeech ?? existing.partOfSpeech ?? "";
        let updatedTerm;
        try {
          updatedTerm = await product.updateTerm(conceptId, termId, {
            locale: payload.locale ?? existing.locale,
            text: payload.term ?? existing.text,
            description: payload.description ?? existing.description ?? "",
            note: payload.note ?? existing.note ?? "",
            partOfSpeech: nextPartOfSpeech,
            status: crowdinStatus(payload.status ?? localStatus(existing.status)),
            type: payload.termType ?? existing.type ?? "",
            gender: payload.gender ?? existing.gender ?? "",
            url: payload.url ?? existing.url ?? "",
            lemma: payload.lemma ?? existing.lemma ?? "",
          });
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (updatedTerm && "terms" in updatedTerm) return glossaryNotFoundResponse(c);
        if (!updatedTerm) return glossaryNotFoundResponse(c);
        return c.json({ term: toCrowdinTermRecord(glossary, conceptId, updatedTerm) }, 200);
      },
    )
    .delete(
      "/:conceptId/terms/:termId",
      validator("param", validateConceptTermParams),
      async (c) => {
        if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId, conceptId, termId } = c.req.valid("param");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const concept = await product.getConcept(conceptId);
        const term = concept?.terms.find((candidate) => String(candidate.id) === termId);
        if (!term) return glossaryNotFoundResponse(c);
        if (term.locale === glossary.sourceLocale) {
          return badRequestResponse(
            c,
            "primary_term_required",
            "A concept must keep its primary source term",
          );
        }
        const deleted = await product.deleteTerm(conceptId, termId);
        if (!deleted) return glossaryNotFoundResponse(c);
        return c.body(null, 204);
      },
    );
}
