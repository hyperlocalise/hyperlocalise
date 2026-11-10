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
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { upsertSetupGuidelineDocument } from "./setup-guideline-document";
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

export type ApplyEngineSetupError =
  | { code: "engine_setup_run_not_ready" }
  | { code: "engine_setup_nothing_to_apply" }
  | { code: "glossary_not_found" }
  | { code: "setup_document_too_long" };

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

async function commitSetupDocument(input: {
  organizationSlug: string;
  run: EngineSetupRun;
  voice: EngineVoicePayload | null;
  rules: EngineRulePayload[];
}): Promise<Result<string | null, ApplyEngineSetupError>> {
  const upserted = await upsertSetupGuidelineDocument({
    organizationSlug: input.organizationSlug,
    voice: input.voice,
    rules: input.rules,
    sourceUrl: input.run.sourceUrl,
  });
  if (isErr(upserted)) {
    return err({ code: "setup_document_too_long" });
  }
  return ok(upserted.value.revisionId);
}

/**
 * Writes accepted suggestions into the engine: terms into a native glossary
 * (existing or newly created) and voice + rules into the wizard-managed setup
 * guideline document. Each writer dedupes, so re-applying after a partial
 * failure is safe.
 */
export async function applyEngineSetup(input: {
  auth: ApiAuthContext;
  organizationSlug: string;
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
    const committed = await commitSetupDocument({
      organizationSlug: input.organizationSlug,
      run: input.run,
      voice,
      rules,
    });
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
