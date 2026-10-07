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
import { validator } from "hono/validator";
import { and, eq } from "drizzle-orm";

import { conflictResponse, badRequestResponse } from "@/api/response.schema";
import { hasOrganizationWideProjectAccess } from "@/api/auth/team-access";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import {
  getGlossaryPersistedReadProduct,
  getGlossaryProduct,
} from "@/lib/glossary/glossary-provider";
import { glossaryUsesPersistedConceptStore } from "@/lib/glossary/glossary-persisted-id";
import { db, schema } from "@/lib/database/client";
import { NativeGlossary as NativeGlossaryProduct } from "@/lib/glossary/native-glossary";
import { listGlossaryConceptAuthors, listGlossaryConceptsPage } from "./glossary-concept-page";
import { listGlossaryTermsPage } from "./glossary-term-page";
import { listGlossaryHistoryPage } from "./glossary-history-page";
import {
  GlossaryValidationError,
  selectGlossaryPrimaryTerm,
  type NativeGlossary,
  type GlossaryConcept,
  type GlossaryConceptInput,
} from "@/lib/glossary/glossary";

import {
  createGlossaryConceptBodySchema,
  createGlossaryConceptTermBodySchema,
  glossaryConceptPageQuerySchema,
  glossaryConceptGetQuerySchema,
  glossaryTermPageQuerySchema,
  glossaryHistoryQuerySchema,
  glossaryIdParamsSchema,
  glossaryConceptIdParamsSchema,
  glossaryConceptTermIdParamsSchema,
  updateGlossaryConceptBodySchema,
  updateGlossaryConceptTermBodySchema,
  type CreateGlossaryConceptTermBody,
  type UpdateGlossaryConceptBody,
  type UpdateGlossaryConceptTermBody,
} from "./glossary.schema";
import {
  externalTmsGlossaryImmutableResponse,
  getContributableGlossary,
  getOwnedGlossary,
  glossaryContributeForbiddenResponse,
  glossaryNotFoundResponse,
  invalidGlossaryPayloadResponse,
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
  return badRequestResponse(c, error.code, error.message, error.details);
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
    caseSensitive?: boolean;
    forbidden?: boolean;
    provenance?: string;
    reviewStatus?: string;
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
    caseSensitive: term.caseSensitive ?? false,
    forbidden: term.forbidden ?? false,
    provenance: term.provenance ?? "sync",
    externalKey: String(term.id),
    reviewStatus: term.reviewStatus ?? "draft",
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

function stripProviderMetadata<T extends Record<string, unknown>>(value: T) {
  const {
    externalKey: _externalKey,
    externalUserId: _externalUserId,
    externalCreatedAt: _externalCreatedAt,
    externalUpdatedAt: _externalUpdatedAt,
    ...nativeValue
  } = value;
  return nativeValue;
}

function toGlossaryConceptRecord(
  glossary: NativeGlossary,
  value: Parameters<typeof toCrowdinConceptRecord>[1],
) {
  const record = toCrowdinConceptRecord(glossary, value);
  if (glossary.source !== "native") return record;
  return {
    ...stripProviderMetadata(record),
    terms: record.terms.map((term) => stripProviderMetadata(term)),
  };
}

function toGlossaryTermRecord(
  glossary: NativeGlossary,
  conceptId: string,
  term: Parameters<typeof toCrowdinTermRecord>[2],
) {
  const record = toCrowdinTermRecord(glossary, conceptId, term);
  return glossary.source === "native" ? stripProviderMetadata(record) : record;
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

export function createGlossaryConceptRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get(
      "/page",
      validator("param", validateGlossaryParams),
      validator("query", (value, c) => {
        const parsed = glossaryConceptPageQuerySchema.safeParse(value);
        return parsed.success ? parsed.data : invalidGlossaryPayloadResponse(c);
      }),
      async (c) => {
        const { glossaryId } = c.req.valid("param");
        const query = c.req.valid("query");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        if (glossary && !glossaryUsesPersistedConceptStore(glossary)) {
          return badRequestResponse(
            c,
            "external_glossary_page_unsupported",
            "Provider-backed glossaries do not expose the native management index",
          );
        }
        const page = await listGlossaryConceptsPage(glossaryId, query);
        if ("code" in page) return badRequestResponse(c, page.code, page.message);
        return c.json(page, 200);
      },
    )
    .get("/authors", validator("param", validateGlossaryParams), async (c) => {
      const { glossaryId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      if (glossary && !glossaryUsesPersistedConceptStore(glossary)) {
        return badRequestResponse(
          c,
          "external_glossary_page_unsupported",
          "Provider-backed glossaries do not expose the native management index",
        );
      }
      const authors = await listGlossaryConceptAuthors(glossaryId);
      return c.json({ authors }, 200);
    })
    .get(
      "/history",
      validator("param", validateGlossaryParams),
      validator("query", (value, c) => {
        const parsed = glossaryHistoryQuerySchema.safeParse(value);
        return parsed.success ? parsed.data : invalidGlossaryPayloadResponse(c);
      }),
      async (c) => {
        const { glossaryId } = c.req.valid("param");
        const query = c.req.valid("query");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) {
          // getOwnedGlossary is null for both ACL denials and deleted glossaries.
          // A still-present glossary must not fall through to the org-scoped
          // history existence check — that leaked team-private term diffs.
          const [existingGlossary] = await db
            .select({ id: schema.glossaries.id })
            .from(schema.glossaries)
            .where(
              and(
                eq(schema.glossaries.id, glossaryId),
                eq(schema.glossaries.organizationId, c.var.auth.organization.localOrganizationId),
              ),
            )
            .limit(1);
          if (existingGlossary) {
            return glossaryNotFoundResponse(c);
          }
          // Retained history after glossary deletion is operator-only.
          if (!hasOrganizationWideProjectAccess(c.var.auth)) {
            return glossaryNotFoundResponse(c);
          }
          const [deletedGlossaryHistory] = await db
            .select({ id: schema.glossaryHistoryEvents.id })
            .from(schema.glossaryHistoryEvents)
            .where(
              and(
                eq(
                  schema.glossaryHistoryEvents.organizationId,
                  c.var.auth.organization.localOrganizationId,
                ),
                eq(schema.glossaryHistoryEvents.glossaryId, glossaryId),
              ),
            )
            .limit(1);
          if (!deletedGlossaryHistory) return glossaryNotFoundResponse(c);
        }
        if (glossary && glossary.source !== "native") {
          return badRequestResponse(
            c,
            "external_glossary_history_unsupported",
            "Provider-backed glossaries do not expose local history",
          );
        }
        const page = await listGlossaryHistoryPage(glossaryId, query);
        if ("code" in page) return badRequestResponse(c, page.code, page.message);
        return c.json(page, 200);
      },
    )
    .get(
      "/:conceptId/terms/page",
      validator("param", validateConceptParams),
      validator("query", (value, c) => {
        const parsed = glossaryTermPageQuerySchema.safeParse(value);
        return parsed.success ? parsed.data : invalidGlossaryPayloadResponse(c);
      }),
      async (c) => {
        const { glossaryId, conceptId } = c.req.valid("param");
        const query = c.req.valid("query");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        if (!glossaryUsesPersistedConceptStore(glossary)) {
          return badRequestResponse(
            c,
            "external_glossary_terms_page_unsupported",
            "Provider-backed glossaries do not expose the native term index",
          );
        }
        const [concept] = await db
          .select({ id: schema.glossaryConcepts.id })
          .from(schema.glossaryConcepts)
          .where(
            and(
              eq(schema.glossaryConcepts.glossaryId, glossaryId),
              eq(schema.glossaryConcepts.id, conceptId),
            ),
          )
          .limit(1);
        if (!concept) return glossaryNotFoundResponse(c);
        const page = await listGlossaryTermsPage(glossaryId, conceptId, query);
        if ("code" in page) return badRequestResponse(c, page.code, page.message);
        return c.json(
          {
            ...page,
            terms: page.terms.map((term) =>
              toGlossaryTermRecord(glossary, conceptId, {
                id: term.id,
                locale: term.locale ?? "",
                text: term.term ?? term.sourceTerm,
                description: term.description,
                note: term.note,
                partOfSpeech: term.partOfSpeech,
                type: term.termType,
                gender: term.gender,
                status: term.status,
                caseSensitive: term.caseSensitive,
                forbidden: term.forbidden,
                provenance: term.provenance,
                reviewStatus: term.reviewStatus,
                url: term.url,
                lemma: term.lemma,
                createdAt: term.createdAt.toISOString(),
                updatedAt: term.updatedAt.toISOString(),
              }),
            ),
          },
          200,
        );
      },
    )
    .get("/", validator("param", validateGlossaryParams), async (c) => {
      const { glossaryId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
      if (!product) return c.json({ concepts: [], total: 0 }, 200);
      const concepts = await product.listConcepts();
      return c.json(
        {
          concepts: concepts.map((concept) => toGlossaryConceptRecord(glossary, concept)),
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
        const { glossaryId } = c.req.valid("param");
        const payload = c.req.valid("json");
        const owned = await getContributableGlossary(c.var.auth, glossaryId);
        if (owned.kind !== "ok") {
          return owned.kind === "not_found"
            ? glossaryNotFoundResponse(c)
            : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
        }
        const { glossary } = owned;
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
        return c.json({ concept: toGlossaryConceptRecord(glossary, created) }, 201);
      },
    )
    .get(
      "/:conceptId",
      validator("param", validateConceptParams),
      validator("query", (value, c) => {
        const parsed = glossaryConceptGetQuerySchema.safeParse(value);
        return parsed.success ? parsed.data : invalidGlossaryPayloadResponse(c);
      }),
      async (c) => {
        const { glossaryId, conceptId } = c.req.valid("param");
        const query = c.req.valid("query");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryPersistedReadProduct({ auth: c.var.auth, glossary });
        if (!product) return nativeGlossaryConceptsOnlyResponse(c);
        const concept =
          product instanceof NativeGlossaryProduct
            ? await product.getConcept(conceptId, { includeTerms: query.includeTerms })
            : await product.getConcept(conceptId);
        if (!concept) return glossaryNotFoundResponse(c);
        return c.json({ concept: toGlossaryConceptRecord(glossary, concept) }, 200);
      },
    )
    .patch(
      "/:conceptId",
      validator("param", validateConceptParams),
      validator("json", (value, c) => validateJson(updateGlossaryConceptBodySchema, value, c)),
      async (c) => {
        const { glossaryId, conceptId } = c.req.valid("param");
        const payload = c.req.valid("json") as UpdateGlossaryConceptBody;
        const owned = await getContributableGlossary(c.var.auth, glossaryId);
        if (owned.kind !== "ok") {
          return owned.kind === "not_found"
            ? glossaryNotFoundResponse(c)
            : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
        }
        const { glossary } = owned;
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const current = await product.getConcept(conceptId);
        if (!current) return glossaryNotFoundResponse(c);
        const { preserveOmittedTerms, deletedTermIds, ...conceptPayload } = payload;
        const merged = {
          ...current,
          ...conceptPayload,
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
                    forbidden: term.forbidden ?? existing?.forbidden ?? false,
                  };
                }),
        } satisfies GlossaryConcept;
        const updateInput: GlossaryConceptInput = {
          ...merged,
          preserveOmittedTerms,
          deletedTermIds,
        };
        let updated;
        try {
          updated = await product.updateConcept(conceptId, updateInput);
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (!updated) return glossaryNotFoundResponse(c);
        return c.json({ concept: toGlossaryConceptRecord(glossary, updated) }, 200);
      },
    )
    .delete("/:conceptId", validator("param", validateConceptParams), async (c) => {
      const { glossaryId, conceptId } = c.req.valid("param");
      const owned = await getContributableGlossary(c.var.auth, glossaryId);
      if (owned.kind !== "ok") {
        return owned.kind === "not_found"
          ? glossaryNotFoundResponse(c)
          : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
      }
      const { glossary } = owned;
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
      const product = getGlossaryPersistedReadProduct({ auth: c.var.auth, glossary });
      if (!product) return nativeGlossaryConceptsOnlyResponse(c);
      const concept = await product.getConcept(conceptId);
      if (!concept) return glossaryNotFoundResponse(c);
      const terms = toGlossaryConceptRecord(glossary, concept).terms;
      return c.json({ terms, total: terms.length }, 200);
    })
    .post(
      "/:conceptId/terms",
      validator("param", validateConceptParams),
      validator("json", (value, c) => validateJson(createGlossaryConceptTermBodySchema, value, c)),
      async (c) => {
        const { glossaryId, conceptId } = c.req.valid("param");
        const payload = c.req.valid("json") as CreateGlossaryConceptTermBody;
        const owned = await getContributableGlossary(c.var.auth, glossaryId);
        if (owned.kind !== "ok") {
          return owned.kind === "not_found"
            ? glossaryNotFoundResponse(c)
            : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
        }
        const { glossary } = owned;
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
        return c.json({ term: toGlossaryTermRecord(glossary, conceptId, term) }, 201);
      },
    )
    .patch(
      "/:conceptId/terms/:termId",
      validator("param", validateConceptTermParams),
      validator("json", (value, c) => validateJson(updateGlossaryConceptTermBodySchema, value, c)),
      async (c) => {
        const { glossaryId, conceptId, termId } = c.req.valid("param");
        const payload = c.req.valid("json") as UpdateGlossaryConceptTermBody;
        const owned = await getContributableGlossary(c.var.auth, glossaryId);
        if (owned.kind !== "ok") {
          return owned.kind === "not_found"
            ? glossaryNotFoundResponse(c)
            : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
        }
        const { glossary } = owned;
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
            forbidden: payload.forbidden ?? existing.forbidden ?? false,
          });
        } catch (error) {
          const response = glossaryValidationErrorResponse(c, error);
          if (response) return response;
          throw error;
        }
        if (updatedTerm && "terms" in updatedTerm) return glossaryNotFoundResponse(c);
        if (!updatedTerm) return glossaryNotFoundResponse(c);
        return c.json({ term: toGlossaryTermRecord(glossary, conceptId, updatedTerm) }, 200);
      },
    )
    .delete(
      "/:conceptId/terms/:termId",
      validator("param", validateConceptTermParams),
      async (c) => {
        const { glossaryId, conceptId, termId } = c.req.valid("param");
        const owned = await getContributableGlossary(c.var.auth, glossaryId);
        if (owned.kind !== "ok") {
          return owned.kind === "not_found"
            ? glossaryNotFoundResponse(c)
            : glossaryContributeForbiddenResponse(c, c.var.auth.membership.role, owned.glossary);
        }
        const { glossary } = owned;
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
