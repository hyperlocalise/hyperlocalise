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
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Judge model deliberately defaults to a different model family than the
 * system under test to reduce self-preference bias.
 */
export const evalJudgeModel = process.env.EVAL_JUDGE_MODEL ?? "anthropic/claude-sonnet-4.5";

const judgeVerdictSchema = z.object({
  score: z.number().min(1).max(5).describe("1 = fails the rubric, 5 = fully satisfies it."),
  reasons: z
    .array(z.string())
    .max(5)
    .describe("Short reasons citing specific rubric lines the answer passed or failed."),
});

export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export async function judgeRubric(input: {
  question: string;
  answer: string;
  rubric: string;
}): Promise<JudgeVerdict> {
  const { output } = await generateText({
    model: evalJudgeModel,
    temperature: 0,
    output: Output.object({ schema: judgeVerdictSchema }),
    instructions:
      "You are a strict evaluator of a localization assistant's answers. " +
      "Score the answer 1-5 against the rubric only. Do not reward verbosity, " +
      "hedging, or unrequested extras. Penalize any claim of work (searches, " +
      "tool runs, file reads) the answer does not substantiate.",
    prompt: [
      "Rubric:",
      input.rubric,
      "",
      "User question:",
      input.question,
      "",
      "Assistant answer:",
      input.answer,
    ].join("\n"),
  });

  return output;
}
