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
  targetLanguageIds: string[];
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
  queryCases: Array<{
    id: string;
    expressions: string[];
  }>;
};

const otaFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/fixture.json", import.meta.url)), "utf8"),
) as OtaFixture;

const trailingSQueryCase = otaFixture.queryCases.find(
  (queryCase) => queryCase.id === "trailing-s-variants",
);

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

function recordedResultsForRun(run: RecordedRun): RecordedResult[] {
  return run.output.data.map((wrapped) => wrapped.data);
}

function expectedMatch(result: RecordedResult, targetLocale: string) {
  const sourceTerm = result.sourceTerms.find((term) => term.languageId === "en");
  const targetTerm = result.targetTerms.find((term) => term.languageId === targetLocale);
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
      recordedResultsForRun(run).map((result) => expectedMatch(result, run.targetLanguageId)),
    ),
  })),
);

describe("Crowdin trailing-s recording characterization", () => {
  it("records consistent source-term behavior across target locales", () => {
    if (!trailingSQueryCase) {
      throw new Error("Fixture is missing the trailing-s-variants query case");
    }

    const runsByLocaleAndExpression = new Map(
      recording.runs.map((run) => [
        `${run.targetLanguageId}\u0000${run.input.expressions[0] ?? ""}`,
        run,
      ]),
    );
    const observations = trailingSQueryCase.expressions.map((expression) => {
      const sourceTermsByLocale = otaFixture.targetLanguageIds.map((targetLanguageId) => {
        const run = runsByLocaleAndExpression.get(`${targetLanguageId}\u0000${expression}`);
        if (!run) {
          throw new Error(
            `Recording is missing ${targetLanguageId}/trailing-s-variants/${expression}`,
          );
        }

        return {
          targetLanguageId,
          sourceTerms: recordedResultsForRun(run)
            .flatMap((result) =>
              result.sourceTerms
                .filter((term) => term.languageId === otaFixture.sourceLanguageId)
                .map((term) => term.text),
            )
            .toSorted(),
        };
      });

      return { expression, sourceTermsByLocale };
    });

    console.info("Crowdin trailing-s observations", observations);

    for (const observation of observations) {
      const [first, ...rest] = observation.sourceTermsByLocale;
      if (!first) {
        throw new Error(`No locale observations for ${observation.expression}`);
      }
      for (const current of rest) {
        expect(current.sourceTerms, observation.expression).toEqual(first.sourceTerms);
      }
    }
  });
});

describe("native glossary concordance against Crowdin recording", () => {
  beforeAll(async () => {
    expect(concordanceCases.length).toBeGreaterThan(0);
    expect(recording.runs.every((run) => run.input.expressions.length === 1)).toBe(true);

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

    expect(importResult.counts.conceptsCreated).toBe(otaFixture.concepts.length);
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
