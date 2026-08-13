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

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";

import type { LocalisationAuditFinding, LocalisationAuditFindingSeverity } from "../types";
import { clampScore } from "./shared";
import type { LunaCreditInput } from "./types";

const logger = createLogger("localisation-audit-credits-luna");

const VISUAL_PROXY_IDS = new Set(["text-overflow", "layout-breakage", "responsive-localisation"]);

const lunaFindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  // OpenAI json_schema requires every property key in `required`. Use null, not omit.
  evidence: z.string().trim().nullable(),
  url: z.string().trim().nullable(),
});

export const lunaOutputSchema = z.object({
  credits: z.array(
    z.object({
      id: z.string().trim().min(1),
      score: z.number().min(0).max(100),
      confidence: z.number().min(0).max(100),
      findings: z.array(lunaFindingSchema),
    }),
  ),
  notes: z.array(
    z.object({
      locale: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      samples: z.array(
        z.object({
          text: z.string().trim().min(1),
          note: z.string().trim().min(1),
        }),
      ),
    }),
  ),
});

export type LunaCreditScore = {
  id: string;
  score: number;
  confidence: number;
  findings: LocalisationAuditFinding[];
};

export type LunaBatchResult = {
  credits: LunaCreditScore[];
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
};

function compactEvidence(evidence: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(evidence);
  if (json.length <= 2_400) {
    return evidence;
  }
  return { truncated: true, preview: json.slice(0, 2_000) };
}

export async function scoreCreditsWithLuna(input: {
  credits: LunaCreditInput[];
}): Promise<LunaBatchResult> {
  if (input.credits.length === 0 || !env.OPENAI_API_KEY) {
    return { credits: [], linguisticNotes: [] };
  }

  const payload = input.credits.map((credit) => ({
    id: credit.id,
    dimension: credit.dimension,
    title: credit.title,
    rubric: credit.rubric,
    evidence: compactEvidence(credit.evidence),
  }));

  try {
    const { output } = await generateText({
      model: getHyperlocaliseAgentModel(),
      output: Output.object({ schema: lunaOutputSchema }),
      prompt: [
        "You are scoring website localisation credits from 0 to 100.",
        "Only use the provided evidence. Do not invent pages or quotes.",
        "Return one result per credit id. Prefer fewer, concrete findings (max 3 per credit).",
        "For visual credits without screenshots, treat overflow/layout/responsive as informed estimates and keep confidence at or below 74.",
        "High-confidence only when the evidence is explicit.",
        "Always include every schema field. Use null for evidence or url when you have no quote or page.",
        "Return notes as an empty array when there are no linguistic notes.",
        JSON.stringify(payload),
      ].join("\n\n"),
    });

    const allowed = new Set(input.credits.map((credit) => credit.id));
    const credits: LunaCreditScore[] = [];
    for (const credit of output.credits) {
      if (!allowed.has(credit.id)) continue;
      const confidenceCap = VISUAL_PROXY_IDS.has(credit.id) ? 74 : 100;
      const confidence = Math.min(credit.confidence, confidenceCap);
      const dimension =
        input.credits.find((item) => item.id === credit.id)?.dimension ?? "linguistic";
      credits.push({
        id: credit.id,
        score: clampScore(credit.score),
        confidence,
        findings: credit.findings.slice(0, 3).map((finding, index) => ({
          id: `luna-${credit.id}-${index}`,
          creditId: credit.id,
          category: dimension,
          severity: finding.severity as LocalisationAuditFindingSeverity,
          title: finding.title,
          summary: finding.summary,
          url: finding.url?.trim() || undefined,
          evidence: finding.evidence?.trim() || undefined,
          confidence,
        })),
      });
    }

    return {
      credits,
      linguisticNotes: output.notes.slice(0, 4).map((note) => ({
        locale: note.locale,
        summary: note.summary,
        samples: note.samples.slice(0, 5),
      })),
    };
  } catch (error) {
    logger.warn("luna credit scoring failed", {
      err: error instanceof Error ? error.message : "unknown",
    });
    return { credits: [], linguisticNotes: [] };
  }
}
