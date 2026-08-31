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

import type { SearchNativeGlossaryToolOutput } from "@/agents/_runtime/shared-tools/search_native_glossary";

import { hasEvalCredentials, runEvalTurn } from "./harness";
import { createEvalReport } from "./report";

const MAX_GLOSSARY_LOOKUP_STEPS = 6;

const nativeGlossaryHit: SearchNativeGlossaryToolOutput = {
  success: true,
  terms: [
    {
      id: "term-eval-1",
      sourceTerm: "checkout",
      targetTerm: "paiement",
      description: "Approved product term for the purchase flow.",
      forbidden: false,
      glossaryId: "glossary-eval-1",
      glossaryName: "Storefront glossary",
      rank: 1,
    },
  ],
};

describe.skipIf(!hasEvalCredentials)("glossary routing trajectory", () => {
  const report = createEvalReport("glossary-routing");

  afterAll(() => {
    report.flush();
  });

  it("consults the native glossary for an approved-term question", async () => {
    const turn = await runEvalTurn(
      {
        runtime: { glossarySearchEnabled: true },
        toolFixtures: {
          search_native_glossary: () => nativeGlossaryHit,
        },
      },
      "How should we translate 'checkout' into French (fr-FR)? Check our glossary for an approved term first.",
    );

    const pass =
      turn.toolNames.includes("search_native_glossary") &&
      turn.text.toLowerCase().includes("paiement") &&
      turn.steps <= MAX_GLOSSARY_LOOKUP_STEPS;
    report.record({ case: "native-glossary-lookup", pass, detail: turn.toolCalls });

    expect(turn.toolNames, `tool calls: ${turn.toolNames.join(", ")}`).toContain(
      "search_native_glossary",
    );
    expect(turn.text.toLowerCase()).toContain("paiement");
    expect(turn.steps).toBeLessThanOrEqual(MAX_GLOSSARY_LOOKUP_STEPS);
  });

  it("answers a capability question without calling tools", async () => {
    const turn = await runEvalTurn(
      { runtime: { glossarySearchEnabled: true } },
      "Hi! What can you help me with?",
    );

    const pass = turn.toolCalls.length === 0 && turn.text.length > 0;
    report.record({
      case: "no-tools-for-capability-question",
      pass,
      detail: turn.toolCalls,
    });

    expect(turn.toolNames, `unexpected tool calls: ${turn.toolNames.join(", ")}`).toHaveLength(0);
    expect(turn.text.length).toBeGreaterThan(0);
  });
});
