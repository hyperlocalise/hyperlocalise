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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import { normalizedGlossaryTermStatusFromStatus } from "@/lib/providers/contracts/glossary-term-status";

import recording from "./fixtures/ota-concordance-recording.json";

const mocks = vi.hoisted(() => ({
  createGlossary: vi.fn(),
  selectGlossaries: vi.fn(),
}));

vi.mock("@/lib/glossary/glossary-provider", () => ({
  createGlossary: (...args: unknown[]) => mocks.createGlossary(...args),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mocks.selectGlossaries(),
      }),
    }),
  },
  schema: {
    glossaries: {
      id: "id",
      status: "status",
      source: "source",
    },
  },
}));

import { searchGlossaryConcordance } from "./glossary-concordance";

type RecordedResult = (typeof recording.runs)[number]["output"]["data"][number]["data"];
type RecordedRun = (typeof recording.runs)[number];

function recordedResultsForRun(run: RecordedRun): RecordedResult[] {
  if (run.input.expressions.length !== 1) {
    throw new Error(`Crowdin recording run ${run.caseId} must contain exactly one expression`);
  }
  return run.output.data.map((wrapped) => wrapped.data);
}

function toNativeMatch(
  result: RecordedResult,
  targetLocale: string,
  rank: number,
): NormalizedGlossaryMatch {
  const sourceTerm = result.sourceTerms[0];
  const targetTerm = result.targetTerms[0];
  if (!sourceTerm || !targetTerm) {
    throw new Error("Recording result must contain source and target terms");
  }

  return {
    id: `recorded:${result.concept.id}:${targetLocale}:${sourceTerm.id}`,
    glossaryId: String(result.glossary.id),
    glossaryName: result.glossary.name,
    sourceTerm: sourceTerm.text,
    targetTerm: targetTerm.text,
    sourceLocale: "en",
    targetLocale,
    description: result.concept.definition || null,
    caseSensitive: false,
    rank,
    matchSource: "synced_database",
    providerKind: null,
    resourceId: String(result.glossary.id),
    externalResourceId: null,
    externalTermId: null,
    termStatus: normalizedGlossaryTermStatusFromStatus(sourceTerm.status),
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

describe("searchGlossaryConcordance with Crowdin recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectGlossaries.mockResolvedValue([
      {
        id: String(recording.glossary.id),
        name: recording.glossary.name,
        source: "native",
        status: "active",
        termCapabilities: {},
      },
    ]);
  });

  it("replays every recorded input/output run without a project id", async () => {
    let expectedMatches: NormalizedGlossaryMatch[] = [];
    const adapterSearches: ReturnType<typeof vi.fn>[] = [];
    mocks.createGlossary.mockImplementation(() => {
      const searchConcordance = vi.fn().mockResolvedValue(expectedMatches);
      adapterSearches.push(searchConcordance);
      return { searchConcordance };
    });

    for (const run of recording.runs) {
      const [expression] = run.input.expressions;
      if (!expression) {
        throw new Error(`Crowdin recording run ${run.caseId} has no expression`);
      }
      const recordedResults = recordedResultsForRun(run);
      expectedMatches = recordedResults.map((result, index) =>
        toNativeMatch(result, run.targetLanguageId, recordedResults.length - index),
      );

      const matches = await searchGlossaryConcordance({
        organizationId: "org-ota-fixture",
        glossaryIds: [String(recording.glossary.id)],
        sourceLocale: run.input.sourceLanguageId,
        targetLocales: [run.input.targetLanguageId],
        sourceText: expression,
        limit: 20,
      });

      expect(matches.map(comparableMatch)).toEqual(expectedMatches.map(comparableMatch));
    }

    const expectedReplayCount = recording.runs.reduce(
      (count, run) => count + run.input.expressions.length,
      0,
    );
    expect(adapterSearches).toHaveLength(expectedReplayCount);
    for (const search of adapterSearches) {
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLocale: "en" }),
        expect.objectContaining({
          organizationId: "org-ota-fixture",
          projectId: "",
        }),
      );
    }
  });
});
