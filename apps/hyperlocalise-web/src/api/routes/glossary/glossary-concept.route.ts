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
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { DomUtils, parseDocument } from "htmlparser2";
import { validator } from "hono/validator";

import { conflictResponse, badRequestResponse } from "@/api/errors";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { parseCsvRows } from "@/lib/csv/parse-csv-rows";
import { db, schema } from "@/lib/database";

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
  type UpsertGlossaryConceptTermBody,
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
    status: term.status as "preferred" | "draft" | "not_recommended",
    caseSensitive: term.caseSensitive,
    forbidden: term.forbidden,
    provenance: term.provenance,
    externalKey: term.externalKey,
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
    createdAt: concept.createdAt.toISOString(),
    updatedAt: concept.updatedAt.toISOString(),
    terms: terms.map((term) => toConceptTermRecord(term, sourceLocale)),
  };
}

async function loadConcept(glossaryId: string, conceptId: string) {
  const [concept] = await db
    .select()
    .from(schema.glossaryConcepts)
    .where(
      and(
        eq(schema.glossaryConcepts.id, conceptId),
        eq(schema.glossaryConcepts.glossaryId, glossaryId),
      ),
    )
    .limit(1);

  if (!concept) {
    return null;
  }

  const terms = await db
    .select()
    .from(schema.glossaryTerms)
    .where(eq(schema.glossaryTerms.conceptId, concept.id))
    .orderBy(asc(schema.glossaryTerms.locale), asc(schema.glossaryTerms.createdAt));

  return { concept, terms };
}

async function loadConcepts(glossaryId: string) {
  const concepts = await db
    .select()
    .from(schema.glossaryConcepts)
    .where(eq(schema.glossaryConcepts.glossaryId, glossaryId))
    .orderBy(desc(schema.glossaryConcepts.createdAt));

  if (concepts.length === 0) {
    return [];
  }

  const terms = await db
    .select()
    .from(schema.glossaryTerms)
    .where(
      inArray(
        schema.glossaryTerms.conceptId,
        concepts.map((concept) => concept.id),
      ),
    )
    .orderBy(asc(schema.glossaryTerms.locale), asc(schema.glossaryTerms.createdAt));
  const termsByConcept = new Map<string, GlossaryConceptTerm[]>();

  for (const term of terms) {
    if (!term.conceptId) continue;
    const current = termsByConcept.get(term.conceptId) ?? [];
    current.push(term);
    termsByConcept.set(term.conceptId, current);
  }

  return concepts.map((concept) => ({ concept, terms: termsByConcept.get(concept.id) ?? [] }));
}

function nativeTermValues(
  glossaryId: string,
  conceptId: string,
  locale: string,
  input: CreateGlossaryConceptTermBody,
) {
  return {
    glossaryId,
    conceptId,
    locale,
    term: input.term,
    sourceTerm: input.term,
    targetTerm: input.term,
    description: input.description ?? "",
    partOfSpeech: input.partOfSpeech ?? "",
    gender: input.gender ?? null,
    termType: input.termType ?? null,
    status: input.status,
    caseSensitive: input.caseSensitive,
    forbidden: input.forbidden,
  };
}

async function createConcept(
  glossaryId: string,
  sourceLocale: string,
  input: CreateGlossaryConceptBody,
) {
  return db.transaction(async (tx) => {
    const [concept] = await tx
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId,
        primaryTerm: input.primaryTerm,
        subject: input.subject ?? "",
        definition: input.definition ?? "",
        translatable: input.translatable,
        note: input.note ?? "",
        url: input.url || null,
      })
      .returning();

    const [term] = await tx
      .insert(schema.glossaryTerms)
      .values(
        nativeTermValues(glossaryId, concept.id, sourceLocale, {
          locale: sourceLocale,
          term: input.primaryTerm,
          status: "preferred",
          caseSensitive: false,
          forbidden: false,
        }),
      )
      .returning();

    return { concept, term };
  });
}

async function assertTermDuplicate(
  conceptId: string,
  locale: string,
  term: string,
  excludedTermId?: string,
) {
  const duplicate = await db
    .select({ id: schema.glossaryTerms.id })
    .from(schema.glossaryTerms)
    .where(
      and(
        eq(schema.glossaryTerms.conceptId, conceptId),
        eq(schema.glossaryTerms.locale, locale),
        sql`lower(${schema.glossaryTerms.term}) = lower(${term})`,
        excludedTermId ? ne(schema.glossaryTerms.id, excludedTermId) : undefined,
      ),
    )
    .limit(1);
  return duplicate.length > 0;
}

async function createConceptTerm(
  glossaryId: string,
  concept: GlossaryConcept,
  sourceLocale: string,
  input: CreateGlossaryConceptTermBody,
) {
  if (await assertTermDuplicate(concept.id, input.locale, input.term)) {
    return null;
  }

  const [term] = await db
    .insert(schema.glossaryTerms)
    .values(nativeTermValues(glossaryId, concept.id, input.locale, input))
    .onConflictDoNothing()
    .returning();

  if (term && input.locale === sourceLocale) {
    await db
      .update(schema.glossaryConcepts)
      .set({ primaryTerm: input.term })
      .where(eq(schema.glossaryConcepts.id, concept.id));
  }

  return term ?? null;
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
      if (glossary.source !== "native") return c.json({ concepts: [], total: 0 }, 200);
      const concepts = await loadConcepts(glossaryId);
      return c.json(
        {
          concepts: concepts.map(({ concept, terms }) =>
            toConceptRecord(concept, terms, glossary.sourceLocale),
          ),
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
        const { concept } = await createConcept(glossaryId, glossary.sourceLocale, payload);
        serverAnalytics.track(PRODUCT_USAGE_ANALYTICS_EVENTS.glossaryTermCreated, {
          status: "created",
          source: "glossary_concept",
        });
        const loaded = await loadConcept(glossaryId, concept.id);
        return c.json(
          { concept: toConceptRecord(loaded!.concept, loaded!.terms, glossary.sourceLocale) },
          201,
        );
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
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
      if (glossary.source !== "native") return nativeGlossaryConceptsOnlyResponse(c);
      const loaded = await loadConcept(glossaryId, conceptId);
      if (!loaded) return glossaryNotFoundResponse(c);
      return c.json(
        { concept: toConceptRecord(loaded.concept, loaded.terms, glossary.sourceLocale) },
        200,
      );
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
        const loaded = await loadConcept(glossaryId, conceptId);
        if (!loaded) return glossaryNotFoundResponse(c);
        const { terms, ...conceptPayload } = payload;
        const termInputs: UpsertGlossaryConceptTermBody[] = terms ?? [];
        const existingTermsById = new Map(loaded.terms.map((term) => [term.id, term]));
        const sourceTermInput = termInputs.find((term) => term.locale === glossary.sourceLocale);
        const nextPrimaryTerm =
          payload.primaryTerm ?? sourceTermInput?.term ?? loaded.concept.primaryTerm;
        const submittedTermKeys = new Set<string>();

        for (const termInput of termInputs) {
          const existingTerm = termInput.id ? existingTermsById.get(termInput.id) : undefined;
          if (termInput.id && !existingTerm) {
            return badRequestResponse(
              c,
              "concept_term_not_found",
              "One of the submitted terms does not belong to this concept",
            );
          }
          if (
            existingTerm?.locale === glossary.sourceLocale &&
            termInput.locale !== glossary.sourceLocale
          ) {
            return badRequestResponse(
              c,
              "source_term_locale_immutable",
              "The primary term must stay in the glossary source locale",
            );
          }

          const nextTerm =
            termInput.locale === glossary.sourceLocale ? nextPrimaryTerm : termInput.term;
          const termKey = `${termInput.locale.toLowerCase()}\u0000${nextTerm.toLowerCase()}`;
          if (submittedTermKeys.has(termKey)) {
            return conflictResponse(
              c,
              "duplicate_glossary_concept_term",
              "A term with this locale and text already exists",
            );
          }
          submittedTermKeys.add(termKey);
          if (await assertTermDuplicate(conceptId, termInput.locale, nextTerm, termInput.id)) {
            return conflictResponse(
              c,
              "duplicate_glossary_concept_term",
              "A term with this locale and text already exists",
            );
          }
        }

        await db.transaction(async (tx) => {
          const shouldUpdatePrimaryTerm =
            payload.primaryTerm !== undefined || sourceTermInput !== undefined;
          await tx
            .update(schema.glossaryConcepts)
            .set({
              ...conceptPayload,
              ...(shouldUpdatePrimaryTerm ? { primaryTerm: nextPrimaryTerm } : {}),
              url: conceptPayload.url === "" ? null : conceptPayload.url,
            })
            .where(eq(schema.glossaryConcepts.id, conceptId));

          if (shouldUpdatePrimaryTerm) {
            await tx
              .update(schema.glossaryTerms)
              .set({
                term: nextPrimaryTerm,
                sourceTerm: nextPrimaryTerm,
                targetTerm: nextPrimaryTerm,
              })
              .where(
                and(
                  eq(schema.glossaryTerms.conceptId, conceptId),
                  eq(schema.glossaryTerms.locale, glossary.sourceLocale),
                ),
              );
          }

          for (const termInput of termInputs) {
            const existingTerm = termInput.id ? existingTermsById.get(termInput.id) : undefined;
            const nextTerm =
              termInput.locale === glossary.sourceLocale ? nextPrimaryTerm : termInput.term;
            const termValues = {
              locale: termInput.locale,
              term: nextTerm,
              targetTerm: nextTerm,
              description: termInput.description ?? existingTerm?.description ?? "",
              partOfSpeech: termInput.partOfSpeech ?? existingTerm?.partOfSpeech ?? "",
              gender:
                termInput.gender !== undefined ? termInput.gender : (existingTerm?.gender ?? null),
              termType:
                termInput.termType !== undefined
                  ? termInput.termType
                  : (existingTerm?.termType ?? null),
              status:
                termInput.status ??
                existingTerm?.status ??
                (termInput.locale === glossary.sourceLocale ? "preferred" : "draft"),
              caseSensitive: termInput.caseSensitive ?? existingTerm?.caseSensitive ?? false,
              forbidden: termInput.forbidden ?? existingTerm?.forbidden ?? false,
            };

            if (existingTerm) {
              await tx
                .update(schema.glossaryTerms)
                .set(termValues)
                .where(
                  and(
                    eq(schema.glossaryTerms.id, existingTerm.id),
                    eq(schema.glossaryTerms.conceptId, conceptId),
                    eq(schema.glossaryTerms.glossaryId, glossaryId),
                  ),
                );
            } else {
              await tx.insert(schema.glossaryTerms).values({
                glossaryId,
                conceptId,
                sourceTerm: nextTerm,
                ...termValues,
              });
            }
          }
        });
        const updated = await loadConcept(glossaryId, conceptId);
        return c.json(
          { concept: toConceptRecord(updated!.concept, updated!.terms, glossary.sourceLocale) },
          200,
        );
      },
    )
    .delete("/:conceptId", validator("param", validateConceptParams), async (c) => {
      if (!isGlossaryMutationAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
      const { glossaryId, conceptId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
      const deleted = await db
        .delete(schema.glossaryConcepts)
        .where(
          and(
            eq(schema.glossaryConcepts.id, conceptId),
            eq(schema.glossaryConcepts.glossaryId, glossaryId),
          ),
        )
        .returning({ id: schema.glossaryConcepts.id });
      if (deleted.length === 0) return glossaryNotFoundResponse(c);
      return c.body(null, 204);
    })
    .get("/:conceptId/terms", validator("param", validateConceptParams), async (c) => {
      const { glossaryId, conceptId } = c.req.valid("param");
      const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
      if (!glossary) return glossaryNotFoundResponse(c);
      if (glossary.source !== "native") return nativeGlossaryConceptsOnlyResponse(c);
      const loaded = await loadConcept(glossaryId, conceptId);
      if (!loaded) return glossaryNotFoundResponse(c);
      const terms = loaded.terms.map((term) => toConceptTermRecord(term, glossary.sourceLocale));
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
        const loaded = await loadConcept(glossaryId, conceptId);
        if (!loaded) return glossaryNotFoundResponse(c);
        const term = await createConceptTerm(
          glossaryId,
          loaded.concept,
          glossary.sourceLocale,
          payload,
        );
        if (!term)
          return conflictResponse(
            c,
            "duplicate_glossary_concept_term",
            "A term with this locale and text already exists",
          );
        return c.json({ term: toConceptTermRecord(term, glossary.sourceLocale) }, 201);
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
        const [existing] = await db
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
        if (glossary.source !== "native") return externalTmsGlossaryImmutableResponse(c);
        const [term] = await db
          .select({ locale: schema.glossaryTerms.locale })
          .from(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.id, termId),
              eq(schema.glossaryTerms.conceptId, conceptId),
              eq(schema.glossaryTerms.glossaryId, glossaryId),
            ),
          )
          .limit(1);
        if (!term) return glossaryNotFoundResponse(c);
        if (term.locale === glossary.sourceLocale) {
          return badRequestResponse(
            c,
            "primary_term_required",
            "A concept must keep its primary source term",
          );
        }
        await db
          .delete(schema.glossaryTerms)
          .where(
            and(
              eq(schema.glossaryTerms.id, termId),
              eq(schema.glossaryTerms.conceptId, conceptId),
              eq(schema.glossaryTerms.glossaryId, glossaryId),
            ),
          );
        return c.body(null, 204);
      },
    );
}
