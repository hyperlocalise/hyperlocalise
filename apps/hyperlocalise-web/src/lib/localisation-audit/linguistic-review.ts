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

import type { LocalisationAuditCrawledPage, LocalisationAuditFinding } from "./types";

const logger = createLogger("localisation-audit-linguistic");

const linguisticOutputSchema = z.object({
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
      findings: z.array(
        z.object({
          severity: z.enum(["critical", "warning", "info"]),
          title: z.string().trim().min(1),
          summary: z.string().trim().min(1),
          evidence: z.string().trim().optional(),
          url: z.string().trim().optional(),
        }),
      ),
    }),
  ),
});

export type LinguisticReviewResult = {
  findings: LocalisationAuditFinding[];
  linguisticNotes: Array<{
    locale: string;
    summary: string;
    samples: Array<{ text: string; note: string }>;
  }>;
};

function sampleStrings(pages: LocalisationAuditCrawledPage[], locale: string): string[] {
  const localeKey = locale.toLowerCase();
  const matched = pages.filter((page) => {
    const haystack = `${page.url} ${page.htmlLang ?? ""}`.toLowerCase();
    return haystack.includes(localeKey) || haystack.includes(localeKey.split("-")[0]!);
  });
  const pool = matched.length > 0 ? matched : pages;
  const chunks: string[] = [];
  for (const page of pool) {
    const parts = page.textSample
      .split(/(?<=[.!?])\s+|\n+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 24 && part.length <= 220);
    for (const part of parts.slice(0, 8)) {
      chunks.push(part);
      if (chunks.length >= 30) {
        return chunks;
      }
    }
  }
  return chunks;
}

export async function runLinguisticLocalisationReview(input: {
  pages: LocalisationAuditCrawledPage[];
  focusLocales: string[];
}): Promise<LinguisticReviewResult> {
  const focusLocales = input.focusLocales
    .map((locale) => locale.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (focusLocales.length === 0 || !env.OPENAI_API_KEY) {
    return { findings: [], linguisticNotes: [] };
  }

  const payload = focusLocales.map((locale) => ({
    locale,
    samples: sampleStrings(input.pages, locale).slice(0, 24),
  }));

  if (payload.every((entry) => entry.samples.length === 0)) {
    return { findings: [], linguisticNotes: [] };
  }

  try {
    const { output } = await generateText({
      model: getHyperlocaliseAgentModel(),
      output: Output.object({ schema: linguisticOutputSchema }),
      prompt: [
        "You are reviewing website copy for localisation quality.",
        "Focus on fluency, market fit, mixed-language UI, and awkward literal translation.",
        "Only comment on the provided samples. Be concrete and cite short evidence.",
        "Return at most 3 findings per locale.",
        JSON.stringify(payload),
      ].join("\n\n"),
    });

    const findings: LocalisationAuditFinding[] = [];
    const linguisticNotes: LinguisticReviewResult["linguisticNotes"] = [];

    for (const note of output.notes) {
      linguisticNotes.push({
        locale: note.locale,
        summary: note.summary,
        samples: note.samples.slice(0, 5),
      });
      for (const finding of note.findings.slice(0, 3)) {
        findings.push({
          id: `ling-${findings.length}`,
          category: "linguistic",
          severity: finding.severity,
          title: finding.title,
          summary: finding.summary,
          url: finding.url,
          evidence: finding.evidence,
        });
      }
    }

    return { findings, linguisticNotes };
  } catch (error) {
    logger.warn("linguistic review failed", {
      err: error instanceof Error ? error.message : "unknown",
    });
    return { findings: [], linguisticNotes: [] };
  }
}
