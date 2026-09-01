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
import { afterEach, describe, expect, it } from "vite-plus/test";

import { emptyImportReportCounts } from "./glossary-interchange";
import {
  createGlossaryImportReport,
  getGlossaryImportReport,
  reportCountsFromDiagnostics,
} from "./glossary-import-reports";
import { createGlossaryTestFixture } from "@/api/routes/glossary/glossary.fixture";

const fixture = createGlossaryTestFixture();

afterEach(async () => {
  await fixture.cleanup();
});

describe("glossary import reports", () => {
  it("counts uncounted failures at the entity level", () => {
    const counts = reportCountsFromDiagnostics(emptyImportReportCounts(), [
      {
        severity: "error",
        code: "invalid_boolean",
        message: "Boolean value is invalid.",
        conceptId: "concept-1",
        termId: "term-1",
      },
    ]);

    expect(counts).toMatchObject({ failed: 1, termsFailed: 1, conceptsFailed: 0 });
  });

  it("does not count file-level diagnostics as concept failures", () => {
    const counts = reportCountsFromDiagnostics(emptyImportReportCounts(), [
      {
        severity: "error",
        code: "invalid_xml",
        message: "The document is not XML.",
      },
    ]);

    expect(counts).toMatchObject({ failed: 1, conceptsFailed: 0, termsFailed: 0 });
  });

  it("counts concept-level diagnostics without a term ID as concept failures", () => {
    const counts = reportCountsFromDiagnostics(emptyImportReportCounts(), [
      {
        severity: "error",
        code: "missing_source_locale",
        message: "Concept has no source locale term.",
        conceptId: "concept-1",
      },
    ]);

    expect(counts).toMatchObject({ failed: 1, conceptsFailed: 1, termsFailed: 0 });
  });

  it("persists large diagnostic collections in bounded batches", async () => {
    const { organization, user, glossary } = await fixture.createStoredGlossaryFixture();
    const diagnostics = Array.from({ length: 1_201 }, (_, index) => ({
      severity: "error" as const,
      code: "invalid_term",
      message: "Term row is invalid.",
      sourceRow: index + 2,
      conceptId: `concept-${index + 1}`,
      termId: `term-${index + 1}`,
      field: "term",
    }));

    const report = await createGlossaryImportReport({
      organizationId: organization.id,
      glossaryId: glossary.id,
      createdByUserId: user.id,
      format: "csv",
      mode: "merge",
      options: {},
      sourceTotals: { concepts: 1_201, terms: 1_201 },
      counts: { ...emptyImportReportCounts(), failed: 1_201, termsFailed: 1_201 },
      diagnostics,
    });

    const stored = await getGlossaryImportReport({
      organizationId: organization.id,
      glossaryId: glossary.id,
      reportId: report.id,
    });
    expect(stored?.entries).toHaveLength(diagnostics.length);
  });
});
