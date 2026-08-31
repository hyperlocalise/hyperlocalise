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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database/client";
import { createGlossaryTestFixture } from "@/api/routes/glossary/glossary.fixture";
import type { GlossaryImportDocument } from "./glossary-interchange";
import { getGlossaryImportReport } from "./glossary-import-reports";
import { applyNativeGlossaryImport } from "./native-glossary-import";

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
      }),
    ).rejects.toThrow();

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
