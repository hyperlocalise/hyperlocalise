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
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { createGlossaryTestFixture } from "@/api/routes/glossary/glossary.fixture";
import type { GlossaryImportDocument } from "./glossary-interchange";
import { getGlossaryImportReport } from "./glossary-import-reports";
import { applyNativeGlossaryImport, planNativeGlossaryImport } from "./native-glossary-import";

const fixture = createGlossaryTestFixture();

afterEach(async () => {
  await fixture.cleanup();
});

describe("native glossary import concurrency", () => {
  it("loads stable-ID state after locking the glossary", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    const document: GlossaryImportDocument = {
      concepts: [
        {
          id: "stable-concept",
          primaryTerm: "Checkout",
          terms: [{ id: "stable-term", locale: "en", term: "Checkout" }],
        },
      ],
      diagnostics: [],
    };

    await Promise.all([
      applyNativeGlossaryImport({ glossaryId: glossary.id, mode: "merge", document }),
      applyNativeGlossaryImport({ glossaryId: glossary.id, mode: "merge", document }),
    ]);

    const concepts = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, glossary.id));
    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(concepts).toHaveLength(1);
    expect(terms).toHaveLength(1);
  });

  it("persists the import report in the native mutation transaction", async () => {
    const { glossary, user } = await fixture.createStoredGlossaryFixture();
    const result = await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: {
        concepts: [
          {
            id: "stable-concept",
            primaryTerm: "Checkout",
            terms: [{ id: "stable-term", locale: "en", term: "Checkout" }],
          },
        ],
        diagnostics: [],
      },
      report: {
        organizationId: glossary.organizationId,
        glossaryId: glossary.id,
        createdByUserId: user.id,
        format: "csv",
        mode: "merge",
        options: {},
        sourceTotals: { concepts: 1, terms: 1 },
      },
    });

    expect(result.reportId).toBeDefined();
    const report = await getGlossaryImportReport({
      organizationId: glossary.organizationId,
      glossaryId: glossary.id,
      reportId: result.reportId!,
    });
    expect(report?.run.counts).toEqual(result.counts);
  });

  it("rolls back glossary changes when the atomic report cannot be persisted", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    const cleanupBackup = vi.fn(async () => undefined);
    await expect(
      applyNativeGlossaryImport({
        glossaryId: glossary.id,
        mode: "merge",
        document: {
          concepts: [
            {
              id: "stable-concept",
              primaryTerm: "Checkout",
              terms: [{ id: "stable-term", locale: "en", term: "Checkout" }],
            },
          ],
          diagnostics: [],
        },
        report: {
          organizationId: glossary.organizationId,
          glossaryId: glossary.id,
          createdByUserId: "00000000-0000-4000-8000-000000000000",
          format: "csv",
          mode: "merge",
          options: {},
          sourceTotals: { concepts: 1, terms: 1 },
        },
        createBackup: async () => ({ fileId: "file_backup", cleanup: cleanupBackup }),
      }),
    ).rejects.toThrow();
    expect(cleanupBackup).toHaveBeenCalledOnce();

    const concepts = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, glossary.id));
    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(concepts).toHaveLength(0);
    expect(terms).toHaveLength(0);
  });
});

describe("native glossary import review and ownership", () => {
  it("applies imported review status on insert and presence-aware update", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    const document = (reviewStatus?: string): GlossaryImportDocument => ({
      concepts: [
        {
          id: "stable-concept",
          primaryTerm: "Checkout",
          terms: [
            {
              id: "stable-term",
              locale: "en",
              term: "Checkout",
              ...(reviewStatus !== undefined ? { reviewStatus } : {}),
            },
          ],
        },
      ],
      diagnostics: [],
    });

    await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: document("draft"),
    });
    const [created] = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(created?.reviewStatus).toBe("draft");

    await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: document("pending"),
    });
    const [updated] = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(updated?.reviewStatus).toBe("pending");

    await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: document(),
    });
    const [preserved] = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(preserved?.reviewStatus).toBe("pending");
  });

  it("does not plan terms for concepts rejected by create or update mode", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: {
        concepts: [
          {
            id: "existing",
            primaryTerm: "Checkout",
            terms: [{ id: "existing-term", locale: "en", term: "Checkout" }],
          },
        ],
        diagnostics: [],
      },
    });

    const createPlan = await planNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "create",
      document: {
        concepts: [
          {
            id: "existing",
            primaryTerm: "Checkout",
            terms: [{ id: "existing-term", locale: "en", term: "Checkout" }],
          },
        ],
        diagnostics: [],
      },
    });
    expect(createPlan.counts.conceptsSkipped).toBe(1);
    expect(createPlan.counts.termsCreated).toBe(0);
    expect(createPlan.counts.termsUpdated).toBe(0);
    expect(createPlan.counts.termsFailed).toBe(0);
    expect(createPlan.counts.termsSkipped).toBe(0);

    const updatePlan = await planNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "update",
      document: {
        concepts: [
          {
            id: "missing",
            primaryTerm: "Invoice",
            terms: [{ id: "missing-term", locale: "en", term: "Invoice" }],
          },
        ],
        diagnostics: [],
      },
    });
    expect(updatePlan.counts.conceptsFailed).toBe(1);
    expect(updatePlan.counts.termsCreated).toBe(0);
    expect(updatePlan.counts.termsFailed).toBe(0);
  });

  it("does not commit a new concept when all of its terms have ID conflicts", async () => {
    const { glossary } = await fixture.createStoredGlossaryFixture();
    await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: {
        concepts: [
          {
            id: "owner",
            primaryTerm: "Owner",
            terms: [{ id: "shared-term", locale: "en", term: "Owner" }],
          },
        ],
        diagnostics: [],
      },
    });

    const result = await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "merge",
      document: {
        concepts: [
          {
            id: "new-concept",
            primaryTerm: "Reassigned",
            terms: [{ id: "shared-term", locale: "en", term: "Reassigned" }],
          },
        ],
        diagnostics: [],
      },
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "term_id_conflict" })]),
    );
    expect(result.counts.conceptsCreated).toBe(0);
    expect(result.counts.conceptsSkipped).toBe(1);
    expect(result.counts.termsFailed).toBe(1);

    const concepts = await db
      .select()
      .from(schema.glossaryConcepts)
      .where(eq(schema.glossaryConcepts.glossaryId, glossary.id));
    const terms = await db
      .select()
      .from(schema.glossaryTerms)
      .where(eq(schema.glossaryTerms.glossaryId, glossary.id));
    expect(concepts).toHaveLength(1);
    expect(concepts[0]?.primaryTerm).toBe("Owner");
    expect(terms).toHaveLength(1);
    expect(terms[0]?.term).toBe("Owner");
  });
});
