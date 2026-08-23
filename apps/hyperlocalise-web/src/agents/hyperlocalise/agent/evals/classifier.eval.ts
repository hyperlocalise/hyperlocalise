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
import { afterAll, describe, expect, it } from "vite-plus/test";

import { createConversationClassifier } from "@/lib/agent-runtime/loops/conversation-classifier";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import { classifierCases, type ClassifierEvalCase } from "./datasets/classifier-cases";
import { evalModel, hasEvalCredentials } from "./harness";
import { createEvalReport } from "./report";

const FLAG_ACCURACY_THRESHOLD = 0.9;

type CaseResult = {
  name: string;
  assertedFlags: number;
  misses: { flag: string; expected: boolean; got: boolean }[];
};

async function classifyCase(evalCase: ClassifierEvalCase): Promise<CaseResult> {
  // createConversationClassifier (not classifyConversation): the latter
  // swallows errors into a fallback classification, which would let a missing
  // credential or model outage masquerade as misclassifications.
  const classify = createConversationClassifier({ model: evalModel });
  const classification = await classify({
    currentMessage: evalCase.currentMessage,
    conversationText: evalCase.conversationText,
    hasFileAttachments: false,
    hasStoredRepositoryContext: evalCase.hasStoredRepositoryContext,
    knowledgeMemoryEnabled: evalCase.knowledgeMemoryEnabled,
    surface: "web",
    model: evalModel,
  });

  const expectedEntries = Object.entries(evalCase.expected) as [
    keyof ClassifierEvalCase["expected"],
    boolean,
  ][];

  return {
    name: evalCase.name,
    assertedFlags: expectedEntries.length,
    misses: expectedEntries
      .filter(([flag, expected]) => classification[flag] !== expected)
      .map(([flag, expected]) => ({ flag, expected, got: classification[flag] })),
  };
}

describe.skipIf(!hasEvalCredentials)("conversation classifier routing", () => {
  const report = createEvalReport("classifier");

  afterAll(() => {
    report.flush();
  });

  it(`classifies repository routing at >=${FLAG_ACCURACY_THRESHOLD * 100}% flag accuracy`, async () => {
    const results = await mapWithConcurrency(classifierCases, 4, classifyCase);

    for (const result of results) {
      report.record({
        case: result.name,
        pass: result.misses.length === 0,
        detail: result.misses.length > 0 ? result.misses : undefined,
      });
    }

    const totalFlags = results.reduce((sum, result) => sum + result.assertedFlags, 0);
    const missedFlags = results.reduce((sum, result) => sum + result.misses.length, 0);
    const accuracy = (totalFlags - missedFlags) / totalFlags;
    const failedCases = results.filter((result) => result.misses.length > 0);

    report.record({
      case: "flag-accuracy",
      pass: accuracy >= FLAG_ACCURACY_THRESHOLD,
      score: accuracy,
    });

    expect(
      accuracy,
      `Flag accuracy ${(accuracy * 100).toFixed(1)}% below threshold. Missed cases:\n${JSON.stringify(failedCases, null, 2)}`,
    ).toBeGreaterThanOrEqual(FLAG_ACCURACY_THRESHOLD);
  });
});
