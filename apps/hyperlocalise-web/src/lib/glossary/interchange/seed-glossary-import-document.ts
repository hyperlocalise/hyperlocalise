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
import { and, eq, isNotNull } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { GlossaryImportDocument } from "./glossary-interchange";

function stableKey(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["hyperlocalise:stableId"];
  return typeof value === "string" ? value : null;
}

/** Test-only helper: create-mode import shape used by concordance fixtures. Production import runs in go-svc. */
export async function seedGlossaryImportDocumentCreate(input: {
  glossaryId: string;
  createdByUserId: string | null;
  document: GlossaryImportDocument;
}) {
  let conceptsCreated = 0;
  let termsCreated = 0;

  await db.transaction(async (tx) => {
    const existingConcepts = await tx
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, input.glossaryId));
    const existingTerms = await tx
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, input.glossaryId));
    const conceptByStableKey = new Map(
      existingConcepts.flatMap((concept) => {
        const key = stableKey(concept.metadata);
        return key ? [[key, concept] as const] : [];
      }),
    );
    const termByStableKey = new Map(
      existingTerms.flatMap((term) => {
        const key = stableKey(term.metadata);
        return key ? [[key, term] as const] : [];
      }),
    );

    for (const incoming of input.document.concepts) {
      if (incoming.terms.length === 0) continue;
      if (conceptByStableKey.has(incoming.id)) continue;

      const primaryTerm =
        incoming.primaryTerm ?? incoming.terms.find((term) => term.term)?.term ?? "";
      if (!primaryTerm) continue;

      const [concept] = await tx
        .insert(schema.glossaryConcepts)
        .values({
          glossaryId: input.glossaryId,
          primaryTerm,
          subject: incoming.subject ?? "",
          definition: incoming.definition ?? "",
          translatable: incoming.translatable ?? true,
          note: incoming.note ?? "",
          url: incoming.url ?? null,
          figure: incoming.figure ?? null,
          languageDetails: incoming.languageDetails ?? [],
          metadata: {
            ...incoming.metadata,
            "hyperlocalise:stableId": incoming.id,
          },
          createdByUserId: input.createdByUserId,
          modifiedByUserId: input.createdByUserId,
        })
        .returning();
      if (!concept) continue;
      conceptByStableKey.set(incoming.id, concept);
      conceptsCreated += 1;

      for (const incomingTerm of incoming.terms) {
        if (termByStableKey.has(incomingTerm.id)) continue;
        const [created] = await tx
          .insert(schema.glossaryTerms)
          .values({
            glossaryId: input.glossaryId,
            conceptId: concept.id,
            locale: incomingTerm.locale,
            term: incomingTerm.term,
            sourceTerm: incomingTerm.term,
            targetTerm: incomingTerm.term,
            description: incomingTerm.description ?? "",
            note: incomingTerm.note ?? "",
            partOfSpeech: incomingTerm.partOfSpeech ?? "",
            gender: incomingTerm.gender ?? null,
            termType: incomingTerm.termType ?? null,
            url: incomingTerm.url ?? null,
            lemma: incomingTerm.lemma ?? null,
            status: incomingTerm.status ?? "draft",
            reviewStatus: incomingTerm.reviewStatus ?? "approved",
            caseSensitive: incomingTerm.caseSensitive ?? false,
            forbidden: incomingTerm.forbidden ?? false,
            provenance: incomingTerm.provenance === "sync" ? "sync" : "manual",
            metadata: {
              ...incomingTerm.metadata,
              "hyperlocalise:stableId": incomingTerm.id,
            },
            createdByUserId: input.createdByUserId,
            modifiedByUserId: input.createdByUserId,
          })
          .returning();
        if (!created) continue;
        termByStableKey.set(incomingTerm.id, created);
        termsCreated += 1;
      }
    }

    const [glossary] = await tx
      .select({ sourceLocale: schema.glossaries.sourceLocale })
      .from(schema.glossaries)
      .where(eq(schema.glossaries.id, input.glossaryId))
      .limit(1);
    if (glossary) {
      const rows = await tx
        .selectDistinct({ locale: schema.glossaryTerms.locale })
        .from(schema.glossaryTerms)
        .where(
          and(
            eq(schema.glossaryTerms.glossaryId, input.glossaryId),
            isNotNull(schema.glossaryTerms.locale),
          ),
        );
      const localeCoverage = rows
        .map((row) => row.locale)
        .filter((locale): locale is string => Boolean(locale) && locale !== glossary.sourceLocale)
        .sort((left, right) => left.localeCompare(right));
      await tx
        .update(schema.glossaries)
        .set({ localeCoverage })
        .where(eq(schema.glossaries.id, input.glossaryId));
    }
  });

  return { conceptsCreated, termsCreated };
}
