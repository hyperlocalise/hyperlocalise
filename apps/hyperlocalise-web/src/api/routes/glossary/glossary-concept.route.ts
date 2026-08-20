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
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { DomUtils, parseDocument } from "htmlparser2";
import { validator } from "hono/validator";

import { conflictResponse, badRequestResponse } from "@/api/errors";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import type { NativeGlossary } from "@/lib/glossary/glossary";
import type { CrowdinGlossaryConcept } from "@/lib/providers/adapters/crowdin/crowdin-provider";

import {
  createGlossaryConceptBodySchema,
  createGlossaryConceptTermBodySchema,
  glossaryIdParamsSchema,
  glossaryConceptIdParamsSchema,
  glossaryConceptTermIdParamsSchema,
  importGlossaryTermsBodySchema,
  updateGlossaryConceptBodySchema,
  updateGlossaryConceptTermBodySchema,
  type CreateGlossaryConceptBody,
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
    case "not recommended":
    case "not_recommended":
      return "not_recommended";
    case "obsolete":
      return "obsolete";
    default:
      return "draft";
  }
}

function toCrowdinConceptInput(
  glossary: NativeGlossary,
  input: CreateGlossaryConceptBody | UpdateGlossaryConceptBody,
): CrowdinGlossaryConcept {
  const primaryTerm = input.primaryTerm ?? "";
  const terms = (input.terms ?? []).map((term) => ({
    id: "id" in term ? term.id : undefined,
    languageId: term.locale,
    text: term.locale === glossary.sourceLocale && primaryTerm ? primaryTerm : term.term,
    description: term.description,
    partOfSpeech: term.partOfSpeech,
    status: crowdinStatus(term.status),
    type: "termType" in term ? (term.termType ?? undefined) : undefined,
    gender: term.gender ?? undefined,
    note: "note" in term && typeof term.note === "string" ? term.note : undefined,
    url: term.url || undefined,
    lemma: term.lemma ?? undefined,
  }));
  if (terms.length === 0 && primaryTerm) {
    terms.push({
      id: undefined,
      languageId: glossary.sourceLocale,
      text: primaryTerm,
      description: undefined,
      partOfSpeech: undefined,
      status: "preferred",
      note: undefined,
      type: undefined,
      gender: undefined,
      url: undefined,
      lemma: undefined,
    });
  }
  return {
    primaryTerm,
    sourceLocale: glossary.sourceLocale,
    subject: input.subject,
    definition: input.definition,
    translatable: input.translatable,
    note: input.note,
    url: input.url,
    figure: input.figure,
    terms,
  };
}

function toCrowdinTermRecord(
  glossary: NativeGlossary,
  conceptId: string,
  term: {
    id?: number | string;
    languageId: string;
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
    locale: term.languageId,
    term: term.text,
    isPrimary: term.languageId === glossary.sourceLocale,
    description: term.description ?? "",
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
      languageId: string;
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
      languageId: string;
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
  const source =
    value.terms.find((term) => term.languageId === glossary.sourceLocale) ?? value.terms[0];
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
      languageId: detail.languageId,
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

type GlossaryConcept = typeof schema.glossaryConcepts.$inferSelect;
type GlossaryConceptTerm = typeof schema.glossaryTerms.$inferSelect;

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

function toConceptTermRecord(term: GlossaryConceptTerm, sourceLocale: string) {
  return {
    id: term.id,
    glossaryId: term.glossaryId,
    conceptId: term.conceptId!,
    locale: term.locale!,
    term: term.term!,
    isPrimary: term.locale === sourceLocale,
    description: term.description,
    partOfSpeech: term.partOfSpeech,
    gender: term.gender,
    termType: term.termType,
    url: term.url,
    lemma: term.lemma,
    status: term.status as "preferred" | "admitted" | "draft" | "not_recommended" | "obsolete",
    caseSensitive: term.caseSensitive,
    forbidden: term.forbidden,
    provenance: term.provenance,
    externalKey: null,
    reviewStatus: term.reviewStatus,
    createdAt: term.createdAt.toISOString(),
    updatedAt: term.updatedAt.toISOString(),
  };
}

function toConceptRecord(
  concept: GlossaryConcept,
  terms: GlossaryConceptTerm[],
  sourceLocale: string,
) {
  return {
    id: concept.id,
    glossaryId: concept.glossaryId,
    primaryTerm: concept.primaryTerm,
    subject: concept.subject,
    definition: concept.definition,
    translatable: concept.translatable,
    note: concept.note,
    url: concept.url,
    figure: concept.figure,
    externalKey: concept.externalKey,
    externalUserId: concept.externalUserId,
    languageDetails: concept.languageDetails,
    externalCreatedAt: concept.externalCreatedAt?.toISOString() ?? null,
    externalUpdatedAt: concept.externalUpdatedAt?.toISOString() ?? null,
    createdAt: concept.createdAt.toISOString(),
    updatedAt: concept.updatedAt.toISOString(),
    terms: terms.map((term) => toConceptTermRecord(term, sourceLocale)),
  };
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

async function importConcepts(
  glossaryId: string,
  sourceLocale: string,
  entries: ConceptImportEntry[],
) {
  return db.transaction(async (tx) => {
    const importedConcepts: GlossaryConcept[] = [];
    let skipped = 0;
    const grouped = new Map<string, ConceptImportEntry[]>();
    for (const entry of entries) {
      const current = grouped.get(entry.conceptKey) ?? [];
      current.push(entry);
      grouped.set(entry.conceptKey, current);
    }

    for (const group of grouped.values()) {
      const first = group[0];
      if (!first) continue;
      const [existing] = await tx
        .select()
        .from(schema.glossaryConcepts)
        .where(
          and(
            eq(schema.glossaryConcepts.glossaryId, glossaryId),
            eq(schema.glossaryConcepts.primaryTerm, first.term),
          ),
        )
        .limit(1);
      const concept =
        existing ??
        (
          await tx
            .insert(schema.glossaryConcepts)
            .values({
              glossaryId,
              primaryTerm: group.find((entry) => entry.locale === sourceLocale)?.term ?? first.term,
              subject: first.subject ?? "",
              definition: first.definition ?? "",
              translatable: first.translatable ?? true,
              note: first.note ?? "",
              url: first.url || null,
            })
            .returning()
        )[0];
      if (!concept) continue;
      if (!existing) importedConcepts.push(concept);

      for (const entry of group) {
        const duplicate = await tx
          .select({ id: schema.glossaryTerms.id })
          .from(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.conceptId, concept.id),
              eq(schema.glossaryTerms.locale, entry.locale),
              sql`lower(${schema.glossaryTerms.term}) = lower(${entry.term})`,
            ),
          )
          .limit(1);
        if (duplicate.length > 0) {
          skipped += 1;
          continue;
        }
        await tx.insert(schema.glossaryTerms).values({
          glossaryId,
          conceptId: concept.id,
          locale: entry.locale,
          term: entry.term,
          sourceTerm: entry.term,
          targetTerm: entry.term,
          description: entry.definition ?? "",
          partOfSpeech: entry.partOfSpeech ?? "",
          gender: entry.gender ?? null,
          termType: entry.termType ?? null,
          status: entry.status ?? (entry.locale === sourceLocale ? "preferred" : "draft"),
          caseSensitive: false,
          forbidden: false,
        });
      }
    }

    return { importedConcepts, skipped };
  });
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
        const created = await product.createConcept(toCrowdinConceptInput(glossary, payload));
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
        if (glossary.source !== "native") {
          if (glossary.externalProviderKind !== "crowdin")
            return externalTmsGlossaryImmutableResponse(c);
          return c.json({ concepts: [], imported: 0, skipped: 0 }, 201);
        }
        const entries = parseConceptImport(payload.content, payload.format).slice(0, 10_000);
        const { importedConcepts, skipped } = await importConcepts(
          glossaryId,
          glossary.sourceLocale,
          entries,
        );
        return c.json(
          {
            concepts: importedConcepts.map((concept) =>
              toConceptRecord(concept, [], glossary.sourceLocale),
            ),
            imported: entries.length - skipped,
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
        const updated = await product.updateConcept(
          conceptId,
          toCrowdinConceptInput(glossary, payload),
        );
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
        const term = await product.createTerm(conceptId, {
          languageId: payload.locale,
          text: payload.term,
          description: payload.description,
          partOfSpeech: payload.partOfSpeech,
          status: crowdinStatus(payload.status),
          type: payload.termType ?? undefined,
          gender: payload.gender ?? undefined,
          url: payload.url ?? undefined,
          lemma: payload.lemma ?? undefined,
        });
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
        if (payload.locale && payload.locale !== existing.languageId) {
          const currentIsPrimary = existing.languageId === glossary.sourceLocale;
          if (currentIsPrimary) {
            return badRequestResponse(
              c,
              "source_term_locale_immutable",
              "The primary term must stay in the glossary source locale",
            );
          }
        }
        const updatedTerm = await product.updateTerm(conceptId, termId, {
          languageId: payload.locale ?? existing.languageId,
          text: payload.term ?? existing.text,
          description: payload.description ?? existing.description ?? "",
          partOfSpeech: payload.partOfSpeech ?? existing.partOfSpeech ?? "",
          status: crowdinStatus(payload.status ?? localStatus(existing.status)),
          type: payload.termType ?? existing.type ?? "",
          gender: payload.gender ?? existing.gender ?? "",
          url: payload.url ?? existing.url ?? "",
          lemma: payload.lemma ?? existing.lemma ?? "",
        });
        if (updatedTerm && "terms" in updatedTerm) return glossaryNotFoundResponse(c);
        if (!updatedTerm) return glossaryNotFoundResponse(c);
        return c.json({ term: toCrowdinTermRecord(glossary, conceptId, updatedTerm) }, 200);
        /*
          .select()
          .from(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.id, termId),
              eq(schema.glossaryTerms.conceptId, conceptId),
              eq(schema.glossaryTerms.glossaryId, glossaryId),
            ),
          )
          .limit(1);
        if (!existing || !existing.locale || !existing.term) return glossaryNotFoundResponse(c);
        if (
          payload.locale &&
          payload.locale !== existing.locale &&
          existing.locale === glossary.sourceLocale
        ) {
          return badRequestResponse(
            c,
            "source_term_locale_immutable",
            "The primary term must stay in the glossary source locale",
          );
        }
        const nextLocale = payload.locale ?? existing.locale;
        const nextTerm = payload.term ?? existing.term;
        if (await assertTermDuplicate(conceptId, nextLocale, nextTerm, termId)) {
          return conflictResponse(
            c,
            "duplicate_glossary_concept_term",
            "A term with this locale and text already exists",
          );
        }
        const setValues = {
          ...payload,
          sourceTerm: nextTerm,
          targetTerm: nextTerm,
        };
        const term = await db.transaction(async (tx) => {
          const [updatedTerm] = await tx
            .update(schema.glossaryTerms)
            .set(setValues)
            .where(
              and(
                eq(schema.glossaryTerms.id, termId),
                eq(schema.glossaryTerms.conceptId, conceptId),
                eq(schema.glossaryTerms.glossaryId, glossaryId),
              ),
            )
            .returning();
          if (!updatedTerm) return undefined;

          if (nextLocale === glossary.sourceLocale) {
            await tx
              .update(schema.glossaryConcepts)
              .set({ primaryTerm: nextTerm })
              .where(eq(schema.glossaryConcepts.id, conceptId));
          }

          return updatedTerm;
        });
        if (!term) return glossaryNotFoundResponse(c);
        return c.json({ term: toConceptTermRecord(term, glossary.sourceLocale) }, 200);
        */
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
        if (term.languageId === glossary.sourceLocale) {
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
