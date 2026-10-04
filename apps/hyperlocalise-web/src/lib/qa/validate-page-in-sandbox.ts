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
import { z } from "zod";

import { createVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import type { QaCheckPolicy } from "./qa-policy";
import type { TranslationQaGlossaryTerm } from "./types";

const INPUT_PATH = ".hyperlocalise-qa/segments.json";
const POLICY_PATH = ".hyperlocalise-qa/policy.json";
const OUTPUT_PATH = ".hyperlocalise-qa/results.json";
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;

export class QaCliUnavailableError extends Error {
  constructor() {
    super("The sandbox CLI does not support hl validate yet");
    this.name = "QaCliUnavailableError";
  }
}

const findingSchema = z.object({
  checkType: z.string(),
  severity: z.enum(["error", "warning"]),
  category: z.enum(["qa", "length", "placeholder", "glossary", "syntax", "spelling"]),
  message: z.string(),
  relatedTokens: z.array(z.string()),
});

const outputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      checks: z.array(findingSchema),
      skippedChecks: z.array(z.string()).optional(),
    }),
  ),
});

export type QaPageSegment = {
  id: string;
  sourceText: string;
  targetText: string;
  sourcePath: string;
  targetLocale: string;
  maxLength: number;
};

export async function validateQaPageInSandbox(input: {
  segments: QaPageSegment[];
  policy: QaCheckPolicy;
  glossaryTerms: TranslationQaGlossaryTerm[];
  acceptedWordsByLocale: Record<string, string[]>;
}) {
  const workspace = await createVercelSandboxWorkspace({ timeoutMs: SANDBOX_TIMEOUT_MS });
  try {
    const availability = await workspace.runCommand("hl", ["validate", "--help"], {
      output: "stdout",
    });
    if (availability.exitCode !== 0) throw new QaCliUnavailableError();
    await workspace.writeFile(
      POLICY_PATH,
      JSON.stringify({
        version: 1,
        checks: input.policy,
        glossaryTerms: input.glossaryTerms,
        acceptedWordsByLocale: input.acceptedWordsByLocale,
      }),
    );
    await workspace.writeFile(INPUT_PATH, JSON.stringify({ segments: input.segments }));
    const command = await workspace.runCommand("bash", [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl validate --input-file ${INPUT_PATH} --policy-file ${POLICY_PATH} --format json > ${OUTPUT_PATH}`,
    ]);
    if (command.exitCode !== 0) {
      throw new Error(`QA CLI validation failed (exit ${command.exitCode})`);
    }
    const parsed = outputSchema.safeParse(JSON.parse(await workspace.readFile(OUTPUT_PATH)));
    if (!parsed.success || parsed.data.results.length !== input.segments.length) {
      throw new Error("QA CLI returned an invalid validation report");
    }
    for (const [index, result] of parsed.data.results.entries()) {
      if (result.id !== input.segments[index]?.id) {
        throw new Error("QA CLI returned out-of-order validation results");
      }
    }
    return parsed.data.results;
  } finally {
    await workspace.stop();
  }
}
