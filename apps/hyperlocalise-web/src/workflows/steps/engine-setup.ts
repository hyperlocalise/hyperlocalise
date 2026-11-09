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
import { consolidateEngineSuggestions } from "@/lib/engine-setup/consolidate-suggestions";
import { extractEngineSignals } from "@/lib/engine-setup/extract-engine-signals";
import { buildPageCorpora, PageCorpusIndex } from "@/lib/engine-setup/page-corpus";
import {
  completeEngineSetupRun,
  failEngineSetupRun,
  findEngineSetupRun,
  loadExistingGlossaryTermKeys,
  markEngineSetupRunProgress,
  markEngineSetupRunRunning,
} from "@/lib/engine-setup/store";
import {
  ENGINE_SETUP_DEFAULT_SOURCE_LOCALE,
  type EngineSetupProgressStage,
} from "@/lib/engine-setup/types";
import { canonicalizeLocale } from "@/lib/i18n/locales";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { LOCALISATION_AUDIT_USER_AGENT_NAME } from "@/lib/localisation-audit/user-agent";
import type { LocalisationAuditCrawlResult } from "@/lib/localisation-audit/types";
import { isErr } from "@/lib/primitives/result/results";

export async function prepareEngineSetupStep(input: { runId: string }) {
  "use step";

  const run = await findEngineSetupRun(input.runId);
  if (!run) {
    return { ok: false as const, code: "engine_setup_run_not_found" as const };
  }
  if (run.status !== "queued") {
    // A replayed start after the run moved on; leave the existing outcome alone.
    return { ok: false as const, code: "engine_setup_run_already_started" as const };
  }
  const claimed = await markEngineSetupRunRunning(run.id);
  if (!claimed) {
    return { ok: false as const, code: "engine_setup_run_already_started" as const };
  }

  return {
    ok: true as const,
    runId: claimed.id,
    organizationId: claimed.organizationId,
    sourceUrl: claimed.sourceUrl,
    sourceLocale: claimed.sourceLocale,
    origin: new URL(claimed.sourceUrl).origin,
  };
}

export async function setEngineSetupProgressStep(input: {
  runId: string;
  progressStage: EngineSetupProgressStage;
  pagesRead?: number;
}) {
  "use step";
  await markEngineSetupRunProgress(input);
  return { ok: true as const };
}

export async function crawlEngineSetupStep(input: {
  origin: string;
  sourceUrl: string;
}): Promise<LocalisationAuditCrawlResult> {
  "use step";
  const { crawlLocalisationAuditSample } = await import("@/lib/localisation-audit/crawl");
  return crawlLocalisationAuditSample(input);
}

function detectSourceLocale(
  requested: string | null,
  pages: LocalisationAuditCrawlResult["pages"],
): string {
  if (requested) return requested;
  const htmlLang = pages[0]?.htmlLang;
  return (htmlLang ? canonicalizeLocale(htmlLang) : null) ?? ENGINE_SETUP_DEFAULT_SOURCE_LOCALE;
}

export async function analyzeEngineSetupStep(input: {
  runId: string;
  organizationId: string;
  sourceLocale: string | null;
  pages: LocalisationAuditCrawlResult["pages"];
  blockedReason?: LocalisationAuditCrawlResult["blockedReason"];
}) {
  "use step";

  if (input.blockedReason) {
    await failEngineSetupRun({
      runId: input.runId,
      status: "blocked",
      errorCode: "crawl_blocked",
      errorMessage: `This site blocked ${LOCALISATION_AUDIT_USER_AGENT_NAME}. Allow it through your firewall, CDN or bot protection, then try again.`,
    });
    return { ok: false as const, code: "crawl_blocked" as const };
  }

  const corpora = buildPageCorpora(input.pages);
  if (corpora.length === 0) {
    await failEngineSetupRun({
      runId: input.runId,
      status: "failed",
      errorCode: "crawl_failed",
      errorMessage: "We could not read any pages on this site.",
    });
    return { ok: false as const, code: "crawl_failed" as const };
  }

  await markEngineSetupRunProgress({
    runId: input.runId,
    progressStage: "extracting",
    pagesRead: corpora.length,
  });
  const candidates = await extractEngineSignals(corpora);
  if (isErr(candidates)) {
    await failEngineSetupRun({
      runId: input.runId,
      status: "failed",
      errorCode: candidates.error.code,
      errorMessage: "We could not analyse this site. Try again in a few minutes.",
    });
    return { ok: false as const, code: candidates.error.code };
  }

  await markEngineSetupRunProgress({ runId: input.runId, progressStage: "consolidating" });
  const [glossaryTermKeys, knowledge] = await Promise.all([
    loadExistingGlossaryTermKeys(input.organizationId),
    getKnowledgeMemoryForOrganization(input.organizationId),
  ]);
  const drafts = consolidateEngineSuggestions({
    candidates: candidates.value,
    index: new PageCorpusIndex(corpora),
    existing: { glossaryTermKeys, knowledgeContent: knowledge.content },
  });

  const run = await completeEngineSetupRun({
    runId: input.runId,
    organizationId: input.organizationId,
    sourceLocale: detectSourceLocale(input.sourceLocale, input.pages),
    pagesRead: corpora.length,
    drafts,
  });
  if (!run) {
    return { ok: false as const, code: "engine_setup_run_not_running" as const };
  }
  return { ok: true as const, runId: run.id, suggestionCount: drafts.length };
}

export async function failEngineSetupStep(input: {
  runId: string;
  errorCode: string;
  errorMessage: string;
}) {
  "use step";
  await failEngineSetupRun({ ...input, status: "failed" });
  return { ok: true as const };
}
