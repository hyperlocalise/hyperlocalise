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
import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";
import type { GlossaryConceptImportEntry } from "@/lib/glossary/glossary";
import { NativeGlossary } from "@/lib/glossary/native-glossary";
import {
  commitKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";
import { KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { mergeEngineSetupKnowledge } from "./merge-knowledge-sections";
import {
  listEngineSetupSuggestions,
  markEngineSetupApplied,
  recordEngineSetupGlossaryApplied,
  type EngineSetupRun,
  type EngineSetupSuggestion,
} from "./store";
import {
  ENGINE_SETUP_DEFAULT_SOURCE_LOCALE,
  type EngineRulePayload,
  type EngineVoicePayload,
} from "./types";

const KNOWLEDGE_COMMIT_ATTEMPTS = 2;

export type ApplyEngineSetupError =
  | { code: "engine_setup_run_not_ready" }
  | { code: "engine_setup_nothing_to_apply" }
  | { code: "glossary_not_found" }
  | { code: "knowledge_memory_too_long" }
  | { code: "knowledge_memory_conflict" };

export type ApplyEngineSetupResult = {
  run: EngineSetupRun;
  glossaryId: string | null;
  termsAdded: number;
  termsSkipped: number;
  rulesApplied: number;
  voiceApplied: boolean;
  knowledgeRevisionId: string | null;
};

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function truncateSummary(summary: string) {
  return summary.length > KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH
    ? `${summary.slice(0, KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH - 1)}…`
    : summary;
}

async function resolveTargetGlossary(input: {
  auth: ApiAuthContext;
  run: EngineSetupRun;
  glossaryId: string | null;
  sourceLocale: string;
}): Promise<Result<GlossaryRecord, ApplyEngineSetupError>> {
  const organizationId = input.auth.organization.localOrganizationId;
  // A retried apply keeps writing to the glossary the first attempt chose or created.
  const glossaryId = input.glossaryId ?? input.run.appliedGlossaryId;
  if (glossaryId) {
    const [glossary] = await db
      .select()
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.id, glossaryId),
          eq(schema.glossaries.organizationId, organizationId),
          eq(schema.glossaries.source, "native"),
          eq(schema.glossaries.status, "active"),
        ),
      )
      .limit(1);
    return glossary ? ok(glossary) : err({ code: "glossary_not_found" });
  }

  const [created] = await db
    .insert(schema.glossaries)
    .values({
      organizationId,
      createdByUserId: input.auth.user.localUserId,
      name: `${hostnameOf(input.run.sourceUrl)} glossary`,
      description: `Terms found on ${input.run.sourceUrl} by the setup wizard.`,
      sourceLocale: input.sourceLocale,
      targetLocale: null,
      controlLevel: "org",
    })
    .returning();
  return ok(created!);
}

function toConceptEntries(
  suggestions: EngineSetupSuggestion[],
  sourceLocale: string,
): GlossaryConceptImportEntry[] {
  const entries: GlossaryConceptImportEntry[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.payload.kind !== "term") continue;
    const { term } = suggestion.payload;
    entries.push({
      conceptKey: suggestion.dedupeKey,
      locale: sourceLocale,
      term: term.term,
      subject: term.termType,
      definition: term.definition,
      translatable: term.translatable,
      note: term.translatable ? "" : "Keep in the source language.",
      url: suggestion.evidence[0]?.url,
    });
  }
  return entries;
}

async function commitKnowledge(input: {
  auth: ApiAuthContext;
  run: EngineSetupRun;
  voice: EngineVoicePayload | null;
  rules: EngineRulePayload[];
}): Promise<Result<string | null, ApplyEngineSetupError>> {
  const organizationId = input.auth.organization.localOrganizationId;
  const summary = truncateSummary(`Setup wizard: ${hostnameOf(input.run.sourceUrl)}`);

  // Re-read and retry once if someone saved knowledge memory between our read and write.
  for (let attempt = 0; attempt < KNOWLEDGE_COMMIT_ATTEMPTS; attempt++) {
    const current = await getKnowledgeMemoryForOrganization(organizationId);
    const merged = mergeEngineSetupKnowledge({
      content: current.content,
      voice: input.voice,
      rules: input.rules,
      sourceUrl: input.run.sourceUrl,
    });
    if (isErr(merged)) {
      return err({ code: "knowledge_memory_too_long" });
    }

    const committed = await commitKnowledgeMemoryForOrganization({
      organizationId,
      content: merged.value,
      summary,
      updatedByUserId: input.auth.user.localUserId,
      expectedRevisionId: current.revisionId,
    });
    if (!isErr(committed)) {
      return ok(committed.value.changed ? committed.value.knowledgeMemory.revisionId : null);
    }
  }
  return err({ code: "knowledge_memory_conflict" });
}

/**
 * Writes accepted suggestions into the engine: terms into a native glossary
 * (existing or newly created) and voice + rules into org knowledge memory.
 * Each writer dedupes, so re-applying after a partial failure is safe.
 */
export async function applyEngineSetup(input: {
  auth: ApiAuthContext;
  run: EngineSetupRun;
  glossaryId: string | null;
}): Promise<Result<ApplyEngineSetupResult, ApplyEngineSetupError>> {
  if (input.run.status !== "ready") {
    return err({ code: "engine_setup_run_not_ready" });
  }

  const accepted = (await listEngineSetupSuggestions(input.run.id)).filter(
    (suggestion) => suggestion.status === "accepted" && suggestion.appliedAt === null,
  );
  if (accepted.length === 0) {
    return err({ code: "engine_setup_nothing_to_apply" });
  }

  const sourceLocale = input.run.sourceLocale ?? ENGINE_SETUP_DEFAULT_SOURCE_LOCALE;
  const terms = accepted.filter((suggestion) => suggestion.kind === "term");
  const rules = accepted.flatMap((suggestion) =>
    suggestion.payload.kind === "rule" ? [suggestion.payload.rule] : [],
  );
  const voice =
    accepted.flatMap((suggestion) =>
      suggestion.payload.kind === "voice" ? [suggestion.payload.voice] : [],
    )[0] ?? null;

  let glossaryId: string | null = input.run.appliedGlossaryId;
  let termsAdded = 0;
  let termsSkipped = 0;
  if (terms.length > 0) {
    const glossary = await resolveTargetGlossary({
      auth: input.auth,
      run: input.run,
      glossaryId: input.glossaryId,
      sourceLocale,
    });
    if (isErr(glossary)) return glossary;
    glossaryId = glossary.value.id;

    const imported = await new NativeGlossary({
      auth: input.auth,
      glossary: glossary.value,
      actorUserId: input.auth.user.localUserId,
    }).importConcepts(toConceptEntries(terms, sourceLocale));
    termsAdded = imported.concepts.length;
    termsSkipped = imported.skipped;
    await recordEngineSetupGlossaryApplied({
      runId: input.run.id,
      suggestionIds: terms.map((suggestion) => suggestion.id),
      glossaryId,
    });
  }

  let knowledgeRevisionId: string | null = null;
  if (voice || rules.length > 0) {
    const committed = await commitKnowledge({ auth: input.auth, run: input.run, voice, rules });
    if (isErr(committed)) return committed;
    knowledgeRevisionId = committed.value;
  }

  const run = await markEngineSetupApplied({
    runId: input.run.id,
    suggestionIds: accepted
      .filter((suggestion) => suggestion.kind !== "term")
      .map((suggestion) => suggestion.id),
    appliedByUserId: input.auth.user.localUserId,
    appliedKnowledgeRevisionId: knowledgeRevisionId,
  });

  return ok({
    run: run ?? input.run,
    glossaryId,
    termsAdded,
    termsSkipped,
    rulesApplied: rules.length,
    voiceApplied: voice !== null,
    knowledgeRevisionId,
  });
}
