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

import { conflictResponse, badRequestResponse } from "@/api/response.schema";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { PRODUCT_USAGE_ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { serverAnalytics } from "@/lib/analytics/server";
import { GlossaryFormatFactory } from "@/lib/glossary/interchange/glossary-format-factory";
import {
  diagnostic,
  emptyImportReportCounts,
} from "@/lib/glossary/interchange/glossary-interchange";
import { validateGlossaryImportDocument } from "@/lib/glossary/interchange/glossary-import-validation";
import {
  applyNativeGlossaryImport,
  planNativeGlossaryImport,
} from "@/lib/glossary/interchange/native-glossary-import";
import {
  createGlossaryImportReport,
  reportCountsFromDiagnostics,
} from "@/lib/glossary/interchange/glossary-import-reports";
import { loadGlossaryInterchangeDocument } from "@/lib/glossary/interchange/glossary-interchange";
import { serializeXlsx } from "@/lib/glossary/interchange/xlsx";
import { createStoredFile, sha256Hex } from "@/lib/file-storage/records";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { getGlossaryProduct } from "@/lib/glossary/glossary-provider";
import { canonicalizeLocale } from "@/lib/i18n/locales";
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
  getContributableGlossary,
  getOwnedGlossary,
  glossaryContributeForbiddenResponse,
  glossaryNotFoundResponse,
  invalidGlossaryPayloadResponse,
  isGlossaryManageAllowed,
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
  status?: "preferred" | "admitted" | "draft" | "not_recommended" | "obsolete";
};

function entriesFromImportDocument(
  document: ReturnType<typeof validateGlossaryImportDocument>["document"],
): ConceptImportEntry[] {
  return document.concepts.flatMap((concept) =>
    concept.terms.map(
      (term) =>
        ({
          conceptKey: concept.id,
          locale: term.locale,
          term: term.term,
          subject: concept.subject,
          definition: concept.definition,
          translatable: concept.translatable,
          note: concept.note,
          url: concept.url ?? undefined,
          partOfSpeech: term.partOfSpeech,
          gender: term.gender,
          termType: term.termType,
          status: term.status as ConceptImportEntry["status"],
        }) satisfies ConceptImportEntry,
    ),
  );
}

function parseConceptImport(
  content: string,
  format: "csv" | "tbx" | "xlsx",
  contentEncoding?: "utf8" | "base64",
  options: { strictLocale: boolean; localeMapping: Record<string, string> } = {
    strictLocale: true,
    localeMapping: {},
  },
) {
  const parsed = GlossaryFormatFactory.create(format).parse(
    format === "xlsx" || contentEncoding === "base64"
      ? Uint8Array.from(Buffer.from(content, "base64"))
      : content,
  );
  for (const concept of parsed.concepts) {
    for (const term of concept.terms) {
      const mapped = options.localeMapping[term.locale] ?? term.locale;
      const canonical = canonicalizeLocale(mapped);
      if (!canonical) {
        parsed.diagnostics.push({
          severity: "error",
          code: "invalid_locale",
          message: "Term locale is not a valid BCP 47 language tag.",
          conceptId: concept.id,
          termId: term.id,
          field: "locale",
        });
      } else {
        term.locale = canonical;
      }
    }
  }
  const entries = entriesFromImportDocument(parsed);
  return { entries, diagnostics: parsed.diagnostics, document: parsed };
}

export function createGlossaryConceptRoutes(
  options: {
    fileStorageAdapter?: FileStorageAdapter;
  } = {},
) {
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
    .post(
      "/import",
      validator("param", validateGlossaryParams),
      validator("json", (value, c) => validateJson(importGlossaryTermsBodySchema, value, c)),
      async (c) => {
        if (!isGlossaryManageAllowed(c.var.auth.membership.role)) return forbiddenResponse(c);
        const { glossaryId } = c.req.valid("param");
        const payload = c.req.valid("json");
        const glossary = await getOwnedGlossary(c.var.auth, glossaryId);
        if (!glossary) return glossaryNotFoundResponse(c);
        const product = getGlossaryProduct({ auth: c.var.auth, glossary });
        if (!product) return externalTmsGlossaryImmutableResponse(c);
        const parsed = parseConceptImport(
          payload.content,
          payload.format,
          payload.contentEncoding,
          {
            strictLocale: payload.strictLocale,
            localeMapping: payload.localeMapping,
          },
        );
        const sourceTotals = {
          concepts: parsed.document.concepts.length,
          terms: parsed.document.concepts.reduce(
            (total, concept) => total + concept.terms.length,
            0,
          ),
        };
        const validated = validateGlossaryImportDocument(parsed.document, {
          sourceLocale: glossary.sourceLocale,
          knownLocales: new Set([glossary.sourceLocale, ...glossary.localeCoverage]),
          strictLocale: payload.strictLocale,
        });
        const importDocument = validated.document;
        const entries = entriesFromImportDocument(importDocument);
        if (payload.mode === "preview") {
          const planned =
            validated.hasFileFatalError ||
            (payload.previewForMode === "replace" && validated.hasErrors)
              ? {
                  diagnostics: importDocument.diagnostics,
                  counts: {
                    ...emptyImportReportCounts(),
                    conceptsRead: sourceTotals.concepts,
                    termsRead: sourceTotals.terms,
                  },
                }
              : glossary.source === "native"
                ? await planNativeGlossaryImport({
                    glossaryId,
                    mode: payload.previewForMode,
                    document: importDocument,
                  })
                : {
                    diagnostics: importDocument.diagnostics,
                    counts: {
                      ...emptyImportReportCounts(),
                      conceptsRead: new Set(entries.map((entry) => entry.conceptKey)).size,
                      termsRead: entries.length,
                      created: entries.length,
                    },
                  };
          const counts = reportCountsFromDiagnostics(planned.counts, planned.diagnostics);
          const report = await createGlossaryImportReport({
            organizationId: c.var.auth.organization.localOrganizationId,
            glossaryId,
            createdByUserId: c.var.auth.user.localUserId,
            format: payload.format,
            mode: payload.mode,
            sourceFilename: payload.sourceFilename,
            options: {
              strictLocale: payload.strictLocale,
              localeMapping: payload.localeMapping,
              previewForMode: payload.previewForMode,
            },
            sourceTotals,
            counts,
            diagnostics: planned.diagnostics,
          });
          return c.json(
            {
              reportId: report.id,
              imported: 0,
              skipped: counts.skipped,
              diagnostics: planned.diagnostics,
              planned: {
                concepts: counts.conceptsCreated + counts.conceptsUpdated + counts.conceptsMerged,
                terms: counts.termsCreated + counts.termsUpdated + counts.termsMerged,
                counts,
              },
            },
            200,
          );
        }
        const sourceBytes =
          payload.contentEncoding === "base64"
            ? Buffer.from(payload.content, "base64")
            : Buffer.from(payload.content, "utf8");
        if (validated.hasFileFatalError) {
          const counts = reportCountsFromDiagnostics(
            {
              ...emptyImportReportCounts(),
              conceptsRead: sourceTotals.concepts,
              termsRead: sourceTotals.terms,
            },
            importDocument.diagnostics,
          );
          const report = await createGlossaryImportReport({
            organizationId: c.var.auth.organization.localOrganizationId,
            glossaryId,
            createdByUserId: c.var.auth.user.localUserId,
            format: payload.format,
            mode: payload.mode,
            sourceFilename: payload.sourceFilename,
            sourceSha256: await sha256Hex(sourceBytes),
            options: { strictLocale: payload.strictLocale, localeMapping: payload.localeMapping },
            sourceTotals,
            counts,
            diagnostics: importDocument.diagnostics,
            status: "failed",
          });
          return badRequestResponse(
            c,
            "invalid_glossary_import",
            "The import source contains file-level validation errors.",
            { reportId: report.id, diagnostics: importDocument.diagnostics },
          );
        }
        if (glossary.source === "native") {
          if (payload.mode === "replace" && validated.hasErrors) {
            const counts = reportCountsFromDiagnostics(
              {
                ...emptyImportReportCounts(),
                conceptsRead: sourceTotals.concepts,
                termsRead: sourceTotals.terms,
              },
              parsed.diagnostics,
            );
            const report = await createGlossaryImportReport({
              organizationId: c.var.auth.organization.localOrganizationId,
              glossaryId,
              createdByUserId: c.var.auth.user.localUserId,
              format: payload.format,
              mode: payload.mode,
              sourceFilename: payload.sourceFilename,
              sourceSha256: await sha256Hex(sourceBytes),
              options: {
                strictLocale: payload.strictLocale,
                localeMapping: payload.localeMapping,
              },
              sourceTotals,
              counts,
              diagnostics: importDocument.diagnostics,
              status: "failed",
            });
            return badRequestResponse(
              c,
              "replace_requires_valid_input",
              "Replace was not applied because the source contains validation errors.",
              { reportId: report.id, diagnostics: importDocument.diagnostics },
            );
          }
          let applied;
          try {
            applied = await applyNativeGlossaryImport({
              glossaryId,
              mode: payload.mode,
              document: importDocument,
              report: {
                organizationId: c.var.auth.organization.localOrganizationId,
                glossaryId,
                createdByUserId: c.var.auth.user.localUserId,
                format: payload.format,
                mode: payload.mode,
                sourceFilename: payload.sourceFilename,
                sourceSha256: await sha256Hex(sourceBytes),
                options: {
                  strictLocale: payload.strictLocale,
                  localeMapping: payload.localeMapping,
                },
                sourceTotals,
              },
              createBackup:
                payload.mode === "create"
                  ? undefined
                  : async ({ tx, glossary: lockedGlossary }) => {
                      const backupDocument = await loadGlossaryInterchangeDocument({
                        glossary: lockedGlossary,
                        db: tx,
                      });
                      const backup = serializeXlsx(backupDocument);
                      if (backup.errors.length > 0) throw new Error("glossary_backup_failed");
                      const backupAdapter = options.fileStorageAdapter ?? getFileStorageAdapter();
                      const backupFile = await createStoredFile({
                        organizationId: c.var.auth.organization.localOrganizationId,
                        createdByUserId: c.var.auth.user.localUserId,
                        role: "reference",
                        sourceKind: "tms_file",
                        filename: `${lockedGlossary.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}-backup.xlsx`,
                        contentType:
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        content: backup.content,
                        metadata: { glossaryId, purpose: "glossary_import_backup" },
                        adapter: backupAdapter,
                        db: tx,
                      });
                      return {
                        fileId: backupFile.id,
                        cleanup: async () => {
                          await backupAdapter.delete({ keyOrUrl: backupFile.storageKey });
                        },
                      };
                    },
            });
          } catch {
            const failureDiagnostic = diagnostic({
              code: "glossary_import_failed",
              message: "The import failed and all glossary changes were rolled back.",
            });
            const counts = reportCountsFromDiagnostics(
              {
                ...emptyImportReportCounts(),
                conceptsRead: sourceTotals.concepts,
                termsRead: sourceTotals.terms,
              },
              [failureDiagnostic],
            );
            const report = await createGlossaryImportReport({
              organizationId: c.var.auth.organization.localOrganizationId,
              glossaryId,
              createdByUserId: c.var.auth.user.localUserId,
              format: payload.format,
              mode: payload.mode,
              sourceFilename: payload.sourceFilename,
              sourceSha256: await sha256Hex(sourceBytes),
              options: { strictLocale: payload.strictLocale, localeMapping: payload.localeMapping },
              sourceTotals,
              counts,
              diagnostics: [failureDiagnostic],
              status: "failed",
            });
            return c.json(
              {
                error: "glossary_import_failed",
                message: "The import failed and all glossary changes were rolled back.",
                details: { reportId: report.id },
              },
              500,
            );
          }
          const counts = applied.counts;
          const reportId = applied.reportId;
          if (!reportId) throw new Error("glossary_import_report_create_failed");
          if (applied.aborted) {
            return badRequestResponse(
              c,
              "replace_requires_valid_input",
              "Replace was not applied because a stable term ID belongs to another concept.",
              { reportId, diagnostics: applied.diagnostics },
            );
          }
          const importedConcepts = await product.listConcepts();
          return c.json(
            {
              reportId,
              concepts: importedConcepts.map((concept) =>
                toGlossaryConceptRecord(glossary, concept),
              ),
              imported: counts.created,
              updated: counts.updated,
              merged: counts.merged,
              skipped: counts.skipped,
              diagnostics: applied.diagnostics,
              backupFileId: applied.backupFileId ?? null,
            },
            201,
          );
        }
        const { concepts: importedConcepts, skipped } = await product.importConcepts(entries);
        const externalCounts = reportCountsFromDiagnostics(
          {
            ...emptyImportReportCounts(),
            conceptsRead: sourceTotals.concepts,
            termsRead: sourceTotals.terms,
            conceptsCreated: importedConcepts.length,
            created: importedConcepts.length,
            skipped,
          },
          importDocument.diagnostics,
        );
        let externalReport;
        try {
          externalReport = await createGlossaryImportReport({
            organizationId: c.var.auth.organization.localOrganizationId,
            glossaryId,
            createdByUserId: c.var.auth.user.localUserId,
            format: payload.format,
            mode: payload.mode,
            sourceFilename: payload.sourceFilename,
            sourceSha256: await sha256Hex(sourceBytes),
            options: {
              strictLocale: payload.strictLocale,
              localeMapping: payload.localeMapping,
            },
            sourceTotals: {
              concepts: sourceTotals.concepts,
              terms: sourceTotals.terms,
            },
            counts: externalCounts,
            diagnostics: importDocument.diagnostics,
          });
        } catch {
          return c.json(
            {
              error: "glossary_import_committed_without_report",
              message:
                "The provider accepted the import, but Hyperlocalise could not persist the import report. Do not retry automatically.",
              details: {
                committed: true,
                imported: importedConcepts.length,
                skipped: externalCounts.skipped,
              },
            },
            500,
          );
        }
        return c.json(
          {
            reportId: externalReport.id,
            concepts: importedConcepts.map((concept) => toGlossaryConceptRecord(glossary, concept)),
            imported: importedConcepts.length,
            skipped: externalCounts.skipped,
            diagnostics: importDocument.diagnostics,
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
      return c.json({ concept: toGlossaryConceptRecord(glossary, concept) }, 200);
    })
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
      const product = getGlossaryProduct({ auth: c.var.auth, glossary });
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
