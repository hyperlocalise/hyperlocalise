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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { createGlossaryTestFixture } from "@/api/routes/glossary/glossary.fixture";
import { db, schema } from "@/lib/database/client";
import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { GlossaryImportDocument } from "./interchange/glossary-interchange";
import { applyNativeGlossaryImport } from "./interchange/native-glossary-import";
import { searchGlossaryConcordance } from "./glossary-concordance";
import recording from "./fixtures/ota-concordance-recording.json";

type OtaFixture = {
  name: string;
  sourceLanguageId: string;
  concepts: Array<{
    id: string;
    subject: string;
    definition: string;
    terms: Array<{
      locale: string;
      text: string;
      description?: string;
      partOfSpeech?: string;
      status: string;
      forbidden?: boolean;
    }>;
  }>;
};

const otaFixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../../../tools/crowdin-ota-glossary-fixture/fixture.json", import.meta.url),
    ),
    "utf8",
  ),
) as OtaFixture;

const fixture = createGlossaryTestFixture();
let createdGlossaryId: string | undefined;
let createdOrganizationId: string | undefined;
let createdUserId: string | undefined;
let seededGlossary: typeof schema.glossaries.$inferSelect | undefined;

type RecordedRun = (typeof recording.runs)[number];
type RecordedResult = RecordedRun["output"]["data"][number]["data"];

function importDocument(): GlossaryImportDocument {
  return {
    diagnostics: [],
    concepts: otaFixture.concepts.map((concept) => ({
      id: concept.id,
      primaryTerm: concept.terms.find(
        (term) => term.locale === otaFixture.sourceLanguageId && term.status === "preferred",
      )?.text,
      subject: concept.subject,
      definition: concept.definition,
      terms: concept.terms.map((term, index) => ({
        id: `${concept.id}:${term.locale}:${index}`,
        locale: term.locale,
        term: term.text,
        description: term.description,
        partOfSpeech: term.partOfSpeech,
        status: term.status,
        forbidden: term.forbidden ?? false,
        reviewStatus: "approved",
        caseSensitive: false,
      })),
    })),
  };
}

function recordedResultsForExpression(run: RecordedRun, expression: string): RecordedResult[] {
  const normalizedExpression = expression.toLocaleLowerCase();
  return run.output.data
    .map((wrapped) => wrapped.data)
    .filter((result) =>
      result.sourceTerms.some((term) =>
        normalizedExpression.includes(term.text.toLocaleLowerCase()),
      ),
    );
}

function expectedMatch(result: RecordedResult, targetLocale: string) {
  const sourceTerm = result.sourceTerms[0];
  const targetTerm = result.targetTerms[0];
  if (!sourceTerm || !targetTerm) {
    throw new Error("Recording result must contain source and target terms");
  }

  return {
    glossaryName: result.glossary.name,
    sourceTerm: sourceTerm.text,
    targetTerm: targetTerm.text,
    sourceLocale: "en",
    targetLocale,
    description: result.concept.definition || null,
    caseSensitive: false,
    termStatus: {
      // Crowdin concordance responses expose status but not the seed's forbidden flag.
      forbidden: false,
      preferred: targetTerm.status === "preferred",
    },
  };
}

function comparableMatch(match: NormalizedGlossaryMatch) {
  return {
    glossaryName: match.glossaryName,
    sourceTerm: match.sourceTerm,
    targetTerm: match.targetTerm,
    sourceLocale: match.sourceLocale,
    targetLocale: match.targetLocale,
    description: match.description,
    caseSensitive: match.caseSensitive,
    termStatus: match.termStatus,
  };
}

function sortComparableMatches<T extends { sourceTerm: string; targetTerm: string }>(matches: T[]) {
  return matches.toSorted((left, right) =>
    `${left.sourceTerm}\u0000${left.targetTerm}`.localeCompare(
      `${right.sourceTerm}\u0000${right.targetTerm}`,
    ),
  );
}

type ComparableMatch = ReturnType<typeof comparableMatch>;
type ConcordanceCase = {
  caseId: string;
  sourceLanguageId: string;
  targetLanguageId: string;
  expression: string;
  crowdin: ComparableMatch[];
};

const concordanceCases: ConcordanceCase[] = recording.runs.flatMap((run) =>
  run.input.expressions.map((expression) => ({
    caseId: run.caseId,
    sourceLanguageId: run.input.sourceLanguageId,
    targetLanguageId: run.input.targetLanguageId,
    expression,
    crowdin: sortComparableMatches(
      recordedResultsForExpression(run, expression).map((result) =>
        expectedMatch(result, run.targetLanguageId),
      ),
    ),
  })),
);

describe("native glossary concordance against Crowdin recording", () => {
  beforeAll(async () => {
    expect(concordanceCases).toHaveLength(160);

    const { glossary } = await fixture.createStoredGlossaryFixture();
    seededGlossary = glossary;
    const cleanupTarget = {
      organizationId: glossary.organizationId,
      glossaryId: glossary.id,
      userId: glossary.createdByUserId,
    };
    createdGlossaryId = cleanupTarget.glossaryId;
    createdOrganizationId = cleanupTarget.organizationId;
    createdUserId = cleanupTarget.userId ?? undefined;

    await db
      .update(schema.glossaries)
      .set({ name: otaFixture.name })
      .where(eq(schema.glossaries.id, glossary.id));

    const importResult = await applyNativeGlossaryImport({
      glossaryId: glossary.id,
      mode: "create",
      document: importDocument(),
    });

    expect(importResult.counts.conceptsCreated).toBe(50);
    expect(importResult.counts.termsCreated).toBeGreaterThanOrEqual(250);
    console.info("seeded native glossary concordance fixture", {
      organizationId: glossary.organizationId,
      glossaryId: glossary.id,
      concepts: importResult.counts.conceptsCreated,
      terms: importResult.counts.termsCreated,
    });
  });

  afterAll(async () => {
    const cleanupTarget = {
      organizationId: createdOrganizationId,
      glossaryId: createdGlossaryId,
      userId: createdUserId,
    };

    try {
      if (createdGlossaryId) {
        await db.delete(schema.glossaries).where(eq(schema.glossaries.id, createdGlossaryId));
      }
      if (createdOrganizationId) {
        await db
          .delete(schema.organizationMemberships)
          .where(eq(schema.organizationMemberships.organizationId, createdOrganizationId));
        await db
          .delete(schema.organizations)
          .where(eq(schema.organizations.id, createdOrganizationId));
      }
      if (createdUserId) {
        await db.delete(schema.users).where(eq(schema.users.id, createdUserId));
      }

      console.info("cleaned up native glossary concordance fixture", cleanupTarget);
    } finally {
      createdGlossaryId = undefined;
      createdOrganizationId = undefined;
      createdUserId = undefined;
      seededGlossary = undefined;
    }
  });

  it.each(concordanceCases)(
    "$caseId [$targetLanguageId] $expression",
    async ({ sourceLanguageId, targetLanguageId, expression, crowdin }) => {
      if (!seededGlossary) {
        throw new Error("Native glossary fixture was not seeded");
      }

      const native = await searchGlossaryConcordance({
        organizationId: seededGlossary.organizationId,
        glossaryIds: [seededGlossary.id],
        sourceLocale: sourceLanguageId,
        targetLocales: [targetLanguageId],
        sourceText: expression,
        limit: 20,
      });
      const pair = {
        input: { sourceLanguageId, targetLanguageId, expression },
        output: {
          crowdin,
          native: sortComparableMatches(native.map(comparableMatch)),
        },
      };

      expect(pair.output.native, JSON.stringify(pair.input)).toEqual(pair.output.crowdin);
    },
  );
});
