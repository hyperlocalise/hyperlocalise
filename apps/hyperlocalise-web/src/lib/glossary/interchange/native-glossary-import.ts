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
import { and, eq, notInArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import {
  diagnostic,
  emptyImportReportCounts,
  type GlossaryImportDocument,
  type GlossaryImportMode,
  type GlossaryImportReportCounts,
} from "./glossary-interchange";
import {
  insertGlossaryImportReport,
  reportCountsFromDiagnostics,
  type GlossaryImportReportInput,
} from "./glossary-import-reports";

const IMPORT_BATCH_SIZE = 250;
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CreateGlossaryImportBackup = (input: {
  tx: DatabaseTransaction;
  glossary: typeof schema.glossaries.$inferSelect;
}) => Promise<{
  fileId: string;
  cleanup?: () => Promise<void>;
}>;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableTermKey(metadata: Record<string, unknown>) {
  const value = metadata["hyperlocalise:stableId"];
  return typeof value === "string" ? value : null;
}

function stableConceptKey(metadata: Record<string, unknown>) {
  const value = metadata["hyperlocalise:stableId"];
  return typeof value === "string" ? value : null;
}

function parseTimestamp(
  value: string | null | undefined,
  diagnostics: ReturnType<typeof diagnostic>[],
  input: { conceptId: string; termId?: string; field: string },
) {
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (!Number.isNaN(timestamp.valueOf())) return timestamp;
  diagnostics.push(
    diagnostic({
      ...input,
      counted: true,
      code: "invalid_timestamp",
      message: "Timestamp must be a valid ISO-8601 date.",
    }),
  );
  return null;
}

function bump(
  counts: GlossaryImportReportCounts,
  kind: "created" | "updated" | "merged" | "skipped" | "failed",
  entity: "concept" | "term",
) {
  counts[kind]++;
  const countKey = {
    concept: {
      created: "conceptsCreated",
      updated: "conceptsUpdated",
      merged: "conceptsMerged",
      skipped: "conceptsSkipped",
      failed: "conceptsFailed",
    },
    term: {
      created: "termsCreated",
      updated: "termsUpdated",
      merged: "termsMerged",
      skipped: "termsSkipped",
      failed: "termsFailed",
    },
  }[entity][kind] as keyof GlossaryImportReportCounts;
  counts[countKey]++;
}

function findExistingConcept(
  incomingId: string,
  conceptsById: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
  conceptsByStableKey: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
  conceptsByExternalKey: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
) {
  return (
    (isUuid(incomingId) ? conceptsById.get(incomingId) : undefined) ??
    conceptsByStableKey.get(incomingId) ??
    conceptsByExternalKey.get(incomingId)
  );
}

function findExistingTerm(
  incomingId: string,
  termsById: Map<string, typeof schema.glossaryTerms.$inferSelect>,
  termsByStableKey: Map<string, typeof schema.glossaryTerms.$inferSelect>,
) {
  return (
    (isUuid(incomingId) ? termsById.get(incomingId) : undefined) ?? termsByStableKey.get(incomingId)
  );
}

function termBelongsToAnotherConcept(
  existingTerm: typeof schema.glossaryTerms.$inferSelect | undefined,
  existingConcept: typeof schema.glossaryConcepts.$inferSelect | undefined,
) {
  return Boolean(existingTerm && (!existingConcept || existingTerm.conceptId !== existingConcept.id));
}

function collectTermOwnershipConflicts(
  concepts: GlossaryImportDocument["concepts"],
  conceptsById: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
  conceptsByStableKey: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
  conceptsByExternalKey: Map<string, typeof schema.glossaryConcepts.$inferSelect>,
  termsById: Map<string, typeof schema.glossaryTerms.$inferSelect>,
  termsByStableKey: Map<string, typeof schema.glossaryTerms.$inferSelect>,
) {
  return concepts.flatMap((incoming) => {
    const existingConcept = findExistingConcept(
      incoming.id,
      conceptsById,
      conceptsByStableKey,
      conceptsByExternalKey,
    );
    return incoming.terms.flatMap((incomingTerm) => {
      const existingTerm = findExistingTerm(incomingTerm.id, termsById, termsByStableKey);
      return termBelongsToAnotherConcept(existingTerm, existingConcept)
        ? [{ conceptId: incoming.id, termId: incomingTerm.id }]
        : [];
    });
  });
}

export async function planNativeGlossaryImport(input: {
  glossaryId: string;
  mode: Exclude<GlossaryImportMode, "preview">;
  document: GlossaryImportDocument;
}) {
  const diagnostics = [...input.document.diagnostics];
  const counts = emptyImportReportCounts();
  counts.conceptsRead = input.document.concepts.length;
  counts.termsRead = input.document.concepts.reduce(
    (total, concept) => total + concept.terms.length,
    0,
  );
  const existingConcepts = await db
    .select()
    .from(schema.glossaryConcepts)
    .where(eq(schema.glossaryConcepts.glossaryId, input.glossaryId));
  const existingTerms = await db
    .select()
    .from(schema.glossaryTerms)
    .where(eq(schema.glossaryTerms.glossaryId, input.glossaryId));
  const conceptsById = new Map(existingConcepts.map((concept) => [concept.id, concept]));
  const conceptsByStableKey = new Map(
    existingConcepts.flatMap((concept) => {
      const key = stableConceptKey(concept.metadata);
      return key ? [[key, concept] as const] : [];
    }),
  );
  const conceptsByExternalKey = new Map(
    existingConcepts.flatMap((concept) =>
      concept.externalKey ? [[concept.externalKey, concept] as const] : [],
    ),
  );
  const termsById = new Map(existingTerms.map((term) => [term.id, term]));
  const termsByStableKey = new Map(
    existingTerms.flatMap((term) => {
      const key = stableTermKey(term.metadata);
      return key ? [[key, term] as const] : [];
    }),
  );
  for (const concept of input.document.concepts) {
    if (concept.terms.length === 0) {
      bump(counts, "skipped", "concept");
      continue;
    }
    const existingConcept = findExistingConcept(
      concept.id,
      conceptsById,
      conceptsByStableKey,
      conceptsByExternalKey,
    );
    if (input.mode === "create" && existingConcept) {
      diagnostics.push(
        diagnostic({
          conceptId: concept.id,
          counted: true,
          code: "concept_already_exists",
          message: "Create mode does not update an existing concept.",
        }),
      );
      bump(counts, "skipped", "concept");
      continue;
    }
    if (input.mode === "update" && !existingConcept) {
      diagnostics.push(
        diagnostic({
          conceptId: concept.id,
          counted: true,
          code: "concept_not_found",
          message: "Update mode requires an existing concept ID.",
        }),
      );
      bump(counts, "failed", "concept");
      continue;
    }
    const conflictingTerms = concept.terms.filter((term) =>
      termBelongsToAnotherConcept(
        findExistingTerm(term.id, termsById, termsByStableKey),
        existingConcept,
      ),
    );
    if (!existingConcept && conflictingTerms.length === concept.terms.length) {
      for (const term of conflictingTerms) {
        diagnostics.push(
          diagnostic({
            conceptId: concept.id,
            termId: term.id,
            counted: true,
            code: "term_id_conflict",
            message: "Term ID belongs to another concept.",
          }),
        );
        bump(counts, "failed", "term");
      }
      bump(counts, "skipped", "concept");
      continue;
    }
    bump(
      counts,
      existingConcept ? (input.mode === "merge" ? "merged" : "updated") : "created",
      "concept",
    );
    for (const term of concept.terms) {
      const existingTerm = findExistingTerm(term.id, termsById, termsByStableKey);
      if (termBelongsToAnotherConcept(existingTerm, existingConcept)) {
        diagnostics.push(
          diagnostic({
            conceptId: concept.id,
            termId: term.id,
            counted: true,
            code: "term_id_conflict",
            message: "Term ID belongs to another concept.",
          }),
        );
        bump(counts, "failed", "term");
      } else if (input.mode === "create" && existingTerm) {
        bump(counts, "skipped", "term");
      } else if (input.mode === "update" && !existingTerm) {
        bump(counts, "failed", "term");
      } else {
        bump(
          counts,
          existingTerm ? (input.mode === "merge" ? "merged" : "updated") : "created",
          "term",
        );
      }
    }
  }
  return { diagnostics, counts };
}

export async function applyNativeGlossaryImport(input: {
  glossaryId: string;
  mode: Exclude<GlossaryImportMode, "preview">;
  document: GlossaryImportDocument;
  report?: Omit<GlossaryImportReportInput, "counts" | "diagnostics">;
  createBackup?: CreateGlossaryImportBackup;
}) {
  const diagnostics = [...input.document.diagnostics];
  const counts = emptyImportReportCounts();
  counts.conceptsRead = input.document.concepts.length;
  counts.termsRead = input.document.concepts.reduce(
    (total, concept) => total + concept.terms.length,
    0,
  );
  const retainedConceptIds = new Set<string>();
  const retainedTermIds = new Set<string>();

  let backupCleanup: (() => Promise<void>) | undefined;
  const transaction = db.transaction(async (tx) => {
    const [glossary] = await tx
      .select()
      .from(schema.glossaries)
      .where(eq(schema.glossaries.id, input.glossaryId))
      .limit(1)
      .for("update");
    if (!glossary) throw new Error("glossary_not_found");
    const existingConcepts = await tx
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, input.glossaryId));
    const existingTerms = await tx
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, input.glossaryId));
    const conceptById = new Map(existingConcepts.map((concept) => [concept.id, concept]));
    const conceptByStableKey = new Map(
      existingConcepts.flatMap((concept) => {
        const key = stableConceptKey(concept.metadata);
        return key ? [[key, concept] as const] : [];
      }),
    );
    const conceptByExternalKey = new Map(
      existingConcepts.flatMap((concept) =>
        concept.externalKey ? [[concept.externalKey, concept] as const] : [],
      ),
    );
    const termById = new Map(existingTerms.map((term) => [term.id, term]));
    const termByStableKey = new Map(
      existingTerms.flatMap((term) => {
        const key = stableTermKey(term.metadata);
        return key ? [[key, term] as const] : [];
      }),
    );
    const ownershipConflicts = collectTermOwnershipConflicts(
      input.document.concepts,
      conceptById,
      conceptByStableKey,
      conceptByExternalKey,
      termById,
      termByStableKey,
    );
    if (input.mode === "replace" && ownershipConflicts.length > 0) {
      for (const conflict of ownershipConflicts) {
        diagnostics.push(
          diagnostic({
            ...conflict,
            counted: true,
            code: "term_id_conflict",
            message: "Term ID belongs to another concept and cannot be replaced.",
          }),
        );
        bump(counts, "failed", "term");
      }
      const reportCounts = reportCountsFromDiagnostics(counts, diagnostics);
      const report = input.report
        ? await insertGlossaryImportReport(tx, {
            ...input.report,
            counts: reportCounts,
            diagnostics,
            status: "failed",
          })
        : undefined;
      return {
        counts: reportCounts,
        reportId: report?.id,
        backupFileId: undefined,
        aborted: true,
      };
    }
    const backup = input.createBackup ? await input.createBackup({ tx, glossary }) : undefined;
    backupCleanup = backup?.cleanup;
    const backupFileId = backup?.fileId;
    for (let offset = 0; offset < input.document.concepts.length; offset += IMPORT_BATCH_SIZE) {
      const batch = input.document.concepts.slice(offset, offset + IMPORT_BATCH_SIZE);
      for (const incoming of batch) {
        if (incoming.terms.length === 0) {
          diagnostics.push(
            diagnostic({
              conceptId: incoming.id,
              counted: true,
              code: "concept_has_no_terms",
              message: "Concept has no valid terms and was not imported.",
            }),
          );
          bump(counts, "skipped", "concept");
          continue;
        }
        const existing = findExistingConcept(
          incoming.id,
          conceptById,
          conceptByStableKey,
          conceptByExternalKey,
        );
        if (input.mode === "create" && existing) {
          diagnostics.push(
            diagnostic({
              conceptId: incoming.id,
              counted: true,
              code: "concept_already_exists",
              message: "Create mode does not update an existing concept.",
            }),
          );
          bump(counts, "skipped", "concept");
          continue;
        }
        if (input.mode === "update" && !existing) {
          diagnostics.push(
            diagnostic({
              conceptId: incoming.id,
              counted: true,
              code: "concept_not_found",
              message: "Update mode requires an existing concept ID.",
            }),
          );
          bump(counts, "failed", "concept");
          continue;
        }
        const primaryTerm =
          incoming.primaryTerm ?? existing?.primaryTerm ?? incoming.terms[0]?.term ?? "";
        if (!primaryTerm) {
          diagnostics.push(
            diagnostic({
              conceptId: incoming.id,
              counted: true,
              code: "concept_missing_primary_term",
              message: "Concept has no primary term.",
            }),
          );
          bump(counts, "failed", "concept");
          continue;
        }
        const conceptCreatedAt = parseTimestamp(incoming.createdAt, diagnostics, {
          conceptId: incoming.id,
          field: "createdAt",
        });
        const conceptUpdatedAt = parseTimestamp(incoming.updatedAt, diagnostics, {
          conceptId: incoming.id,
          field: "updatedAt",
        });
        if (conceptCreatedAt === null || conceptUpdatedAt === null) {
          bump(counts, "failed", "concept");
          continue;
        }
        const conflictingTerms = incoming.terms.filter((incomingTerm) =>
          termBelongsToAnotherConcept(
            findExistingTerm(incomingTerm.id, termById, termByStableKey),
            existing,
          ),
        );
        if (!existing && conflictingTerms.length === incoming.terms.length) {
          for (const incomingTerm of conflictingTerms) {
            diagnostics.push(
              diagnostic({
                conceptId: incoming.id,
                termId: incomingTerm.id,
                counted: true,
                code: "term_id_conflict",
                message: "Term ID belongs to another concept.",
              }),
            );
            bump(counts, "failed", "term");
          }
          bump(counts, "skipped", "concept");
          continue;
        }
        const conceptValues = {
          primaryTerm,
          subject: incoming.subject ?? existing?.subject ?? "",
          definition: incoming.definition ?? existing?.definition ?? "",
          translatable: incoming.translatable ?? existing?.translatable ?? true,
          note: incoming.note ?? existing?.note ?? "",
          url: incoming.url !== undefined ? incoming.url : (existing?.url ?? null),
          figure: incoming.figure !== undefined ? incoming.figure : (existing?.figure ?? null),
          languageDetails:
            incoming.languageDetails !== undefined
              ? incoming.languageDetails
              : (existing?.languageDetails ?? []),
          metadata: {
            ...(incoming.metadata !== undefined ? incoming.metadata : (existing?.metadata ?? {})),
            "hyperlocalise:stableId": incoming.id,
          },
        };
        const conceptUpdateValues = {
          ...(incoming.primaryTerm !== undefined ? { primaryTerm } : {}),
          ...(incoming.subject !== undefined ? { subject: conceptValues.subject } : {}),
          ...(incoming.definition !== undefined ? { definition: conceptValues.definition } : {}),
          ...(incoming.translatable !== undefined
            ? { translatable: conceptValues.translatable }
            : {}),
          ...(incoming.note !== undefined ? { note: conceptValues.note } : {}),
          ...(incoming.url !== undefined ? { url: conceptValues.url } : {}),
          ...(incoming.figure !== undefined ? { figure: conceptValues.figure } : {}),
          ...(incoming.languageDetails !== undefined
            ? { languageDetails: conceptValues.languageDetails }
            : {}),
          ...(incoming.metadata !== undefined ? { metadata: conceptValues.metadata } : {}),
          ...(conceptCreatedAt !== undefined
            ? { createdAt: conceptCreatedAt }
            : existing
              ? { createdAt: existing.createdAt }
              : {}),
          ...(conceptUpdatedAt !== undefined
            ? { updatedAt: conceptUpdatedAt }
            : existing
              ? { updatedAt: existing.updatedAt }
              : {}),
        };
        let concept = existing;
        if (concept) {
          await tx
            .update(schema.glossaryConcepts)
            .set(conceptUpdateValues)
            .where(eq(schema.glossaryConcepts.id, concept.id));
          retainedConceptIds.add(concept.id);
          bump(counts, input.mode === "merge" ? "merged" : "updated", "concept");
        } else {
          const [created] = await tx
            .insert(schema.glossaryConcepts)
            .values({
              glossaryId: input.glossaryId,
              ...conceptValues,
              ...(conceptCreatedAt !== undefined ? { createdAt: conceptCreatedAt } : {}),
              ...(conceptUpdatedAt !== undefined ? { updatedAt: conceptUpdatedAt } : {}),
            })
            .returning();
          if (!created) throw new Error("glossary_concept_create_failed");
          concept = created;
          conceptById.set(created.id, created);
          conceptByStableKey.set(incoming.id, created);
          retainedConceptIds.add(created.id);
          bump(counts, "created", "concept");
        }
        for (const incomingTerm of incoming.terms) {
          const existingTerm = findExistingTerm(incomingTerm.id, termById, termByStableKey);
          if (termBelongsToAnotherConcept(existingTerm, concept)) {
            diagnostics.push(
              diagnostic({
                conceptId: incoming.id,
                termId: incomingTerm.id,
                counted: true,
                code: "term_id_conflict",
                message: "Term ID belongs to another concept.",
              }),
            );
            bump(counts, "failed", "term");
            continue;
          }
          if (input.mode === "create" && existingTerm) {
            diagnostics.push(
              diagnostic({
                conceptId: incoming.id,
                termId: incomingTerm.id,
                counted: true,
                code: "term_already_exists",
                message: "Create mode does not update an existing term.",
              }),
            );
            bump(counts, "skipped", "term");
            continue;
          }
          if (input.mode === "update" && !existingTerm) {
            diagnostics.push(
              diagnostic({
                conceptId: incoming.id,
                termId: incomingTerm.id,
                counted: true,
                code: "term_not_found",
                message: "Update mode requires an existing term ID.",
              }),
            );
            bump(counts, "failed", "term");
            continue;
          }
          const termCreatedAt = parseTimestamp(incomingTerm.createdAt, diagnostics, {
            conceptId: incoming.id,
            termId: incomingTerm.id,
            field: "createdAt",
          });
          const termUpdatedAt = parseTimestamp(incomingTerm.updatedAt, diagnostics, {
            conceptId: incoming.id,
            termId: incomingTerm.id,
            field: "updatedAt",
          });
          if (termCreatedAt === null || termUpdatedAt === null) {
            bump(counts, "failed", "term");
            continue;
          }
          const metadata = {
            ...(incomingTerm.metadata !== undefined
              ? incomingTerm.metadata
              : (existingTerm?.metadata ?? {})),
            "hyperlocalise:stableId": incomingTerm.id,
          };
          const provenance: "manual" | "sync" =
            incomingTerm.provenance === "sync"
              ? "sync"
              : incomingTerm.provenance === "manual"
                ? "manual"
                : (existingTerm?.provenance ?? "manual");
          if (
            incomingTerm.provenance !== undefined &&
            incomingTerm.provenance !== "manual" &&
            incomingTerm.provenance !== "sync"
          ) {
            diagnostics.push(
              diagnostic({
                severity: "warning",
                conceptId: incoming.id,
                termId: incomingTerm.id,
                code: "unsupported_provenance",
                message: "The term provenance was mapped to the native manual value.",
                field: "provenance",
              }),
            );
          }
          const values = {
            conceptId: concept.id,
            locale: incomingTerm.locale,
            term: incomingTerm.term,
            sourceTerm: incomingTerm.term,
            targetTerm: incomingTerm.term,
            description: incomingTerm.description ?? existingTerm?.description ?? "",
            note: incomingTerm.note ?? existingTerm?.note ?? "",
            partOfSpeech: incomingTerm.partOfSpeech ?? existingTerm?.partOfSpeech ?? "",
            gender:
              incomingTerm.gender !== undefined
                ? incomingTerm.gender
                : (existingTerm?.gender ?? null),
            termType:
              incomingTerm.termType !== undefined
                ? incomingTerm.termType
                : (existingTerm?.termType ?? null),
            url: incomingTerm.url !== undefined ? incomingTerm.url : (existingTerm?.url ?? null),
            lemma:
              incomingTerm.lemma !== undefined ? incomingTerm.lemma : (existingTerm?.lemma ?? null),
            status: incomingTerm.status ?? existingTerm?.status ?? "draft",
            reviewStatus: incomingTerm.reviewStatus ?? existingTerm?.reviewStatus ?? "approved",
            caseSensitive: incomingTerm.caseSensitive ?? existingTerm?.caseSensitive ?? false,
            forbidden: incomingTerm.forbidden ?? existingTerm?.forbidden ?? false,
            provenance,
            metadata,
          };
          const termUpdateValues = {
            conceptId: concept.id,
            locale: incomingTerm.locale,
            term: incomingTerm.term,
            sourceTerm: incomingTerm.term,
            targetTerm: incomingTerm.term,
            ...(incomingTerm.description !== undefined
              ? { description: incomingTerm.description }
              : {}),
            ...(incomingTerm.note !== undefined ? { note: incomingTerm.note } : {}),
            ...(incomingTerm.partOfSpeech !== undefined
              ? { partOfSpeech: incomingTerm.partOfSpeech }
              : {}),
            ...(incomingTerm.gender !== undefined ? { gender: incomingTerm.gender } : {}),
            ...(incomingTerm.termType !== undefined ? { termType: incomingTerm.termType } : {}),
            ...(incomingTerm.url !== undefined ? { url: incomingTerm.url } : {}),
            ...(incomingTerm.lemma !== undefined ? { lemma: incomingTerm.lemma } : {}),
            ...(incomingTerm.status !== undefined ? { status: incomingTerm.status } : {}),
            ...(incomingTerm.reviewStatus !== undefined
              ? { reviewStatus: incomingTerm.reviewStatus }
              : {}),
            ...(incomingTerm.caseSensitive !== undefined
              ? { caseSensitive: incomingTerm.caseSensitive }
              : {}),
            ...(incomingTerm.forbidden !== undefined ? { forbidden: incomingTerm.forbidden } : {}),
            ...(incomingTerm.provenance !== undefined ? { provenance } : {}),
            ...(incomingTerm.metadata !== undefined ? { metadata } : {}),
            ...(termCreatedAt !== undefined
              ? { createdAt: termCreatedAt }
              : existingTerm
                ? { createdAt: existingTerm.createdAt }
                : {}),
            ...(termUpdatedAt !== undefined
              ? { updatedAt: termUpdatedAt }
              : existingTerm
                ? { updatedAt: existingTerm.updatedAt }
                : {}),
          };
          if (existingTerm) {
            await tx
              .update(schema.glossaryTerms)
              .set(termUpdateValues)
              .where(eq(schema.glossaryTerms.id, existingTerm.id));
            retainedTermIds.add(existingTerm.id);
            termByStableKey.set(incomingTerm.id, existingTerm);
            bump(counts, input.mode === "merge" ? "merged" : "updated", "term");
          } else {
            const [created] = await tx
              .insert(schema.glossaryTerms)
              .values({
                glossaryId: input.glossaryId,
                ...values,
                ...(termCreatedAt !== undefined ? { createdAt: termCreatedAt } : {}),
                ...(termUpdatedAt !== undefined ? { updatedAt: termUpdatedAt } : {}),
              })
              .returning();
            if (!created) throw new Error("glossary_term_create_failed");
            termById.set(created.id, created);
            termByStableKey.set(incomingTerm.id, created);
            retainedTermIds.add(created.id);
            bump(counts, "created", "term");
          }
        }
      }
    }
    if (input.mode === "replace") {
      const termScope = eq(schema.glossaryTerms.glossaryId, input.glossaryId);
      if (retainedTermIds.size > 0) {
        await tx
          .delete(schema.glossaryTerms)
          .where(and(termScope, notInArray(schema.glossaryTerms.id, [...retainedTermIds])));
      } else {
        await tx.delete(schema.glossaryTerms).where(termScope);
      }

      const conceptScope = eq(schema.glossaryConcepts.glossaryId, input.glossaryId);
      if (retainedConceptIds.size > 0) {
        await tx
          .delete(schema.glossaryConcepts)
          .where(
            and(conceptScope, notInArray(schema.glossaryConcepts.id, [...retainedConceptIds])),
          );
      } else {
        await tx.delete(schema.glossaryConcepts).where(conceptScope);
      }
    }
    const reportCounts = reportCountsFromDiagnostics(counts, diagnostics);
    const report = input.report
      ? await insertGlossaryImportReport(tx, {
          ...input.report,
          counts: reportCounts,
          diagnostics,
          backupFileId,
        })
      : undefined;
    return { counts: reportCounts, reportId: report?.id, backupFileId, aborted: false };
  });
  const result = await transaction.catch(async (error) => {
    try {
      await backupCleanup?.();
    } catch {
      // Preserve the original transaction failure; cleanup is best effort.
    }
    throw error;
  });
  return {
    diagnostics,
    counts: result.counts,
    reportId: result.reportId,
    backupFileId: result.backupFileId,
    aborted: result.aborted,
  };
}
