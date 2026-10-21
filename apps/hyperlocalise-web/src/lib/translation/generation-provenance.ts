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

/*
 * What a translation job gave the model: identities and counts only. Guideline text,
 * passages, instructions and prompts never belong here, because the activity log copies it.
 */

const typedGuidelineUseSchema = z.object({
  revisionId: z.string().min(1),
  version: z.number().int().nonnegative(),
});

const uploadedGuidelineUseSchema = z.object({
  documentId: z.string().min(1),
  revisionId: z.string().min(1),
  version: z.number().int().nonnegative(),
  title: z.string(),
  mandatory: z.boolean(),
  locale: z.string().optional(),
  /** Mandatory, but left out because it did not fit the context budget. */
  omitted: z.literal(true).optional(),
});

const guidelinesUsedSchema = z.object({
  project: typedGuidelineUseSchema.optional(),
  workspace: typedGuidelineUseSchema.optional(),
  documents: z.array(uploadedGuidelineUseSchema),
});

const generationTriggerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("automation"),
    automationId: z.string().min(1),
    runId: z.string().min(1),
    name: z.string(),
  }),
  z.object({ kind: z.literal("api_key"), apiKeyId: z.string().min(1) }),
  z.object({ kind: z.literal("conversation"), interactionId: z.string().min(1) }),
  z.object({ kind: z.literal("user"), userId: z.string().min(1) }),
]);

const generationModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  credentialSource: z.enum(["byok", "gateway"]),
});

const glossaryUseSchema = z.object({
  glossaryId: z.string().min(1),
  name: z.string(),
  termCount: z.number().int().positive(),
});

const translationMemoryUseSchema = z.object({
  memoryId: z.string().min(1),
  name: z.string(),
  matchCount: z.number().int().positive(),
});

export const generationProvenanceSchema = z.object({
  trigger: generationTriggerSchema.optional(),
  model: generationModelSchema.optional(),
  guidelines: guidelinesUsedSchema,
  glossaries: z.array(glossaryUseSchema),
  translationMemories: z.array(translationMemoryUseSchema),
  customInstructions: z.boolean(),
});

export type TypedGuidelineUse = z.infer<typeof typedGuidelineUseSchema>;
export type UploadedGuidelineUse = z.infer<typeof uploadedGuidelineUseSchema>;
export type GuidelinesUsed = z.infer<typeof guidelinesUsedSchema>;
export type GenerationTrigger = z.infer<typeof generationTriggerSchema>;
export type GenerationModel = z.infer<typeof generationModelSchema>;
export type GlossaryUse = z.infer<typeof glossaryUseSchema>;
export type TranslationMemoryUse = z.infer<typeof translationMemoryUseSchema>;
export type GenerationProvenance = z.infer<typeof generationProvenanceSchema>;

export const NO_GUIDELINES_USED: GuidelinesUsed = { documents: [] };

export function parseGenerationProvenance(value: unknown): GenerationProvenance | null {
  const parsed = generationProvenanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGenerationTrigger(value: unknown): GenerationTrigger | null {
  const parsed = generationTriggerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Splits a gateway model id such as `provider/model` into its provider and model. */
export function generationModelFromGatewayId(
  modelId: string,
  credentialSource: GenerationModel["credentialSource"],
): GenerationModel {
  const separator = modelId.indexOf("/");
  return separator > 0
    ? {
        provider: modelId.slice(0, separator),
        model: modelId.slice(separator + 1),
        credentialSource,
      }
    : { provider: "unknown", model: modelId, credentialSource };
}

/** Trigger for a job that was not started by an automation, read from its job row. */
export function generationTriggerFromJobSource(source: {
  apiKeyId: string | null;
  interactionId: string | null;
  createdByUserId: string | null;
}): GenerationTrigger | undefined {
  if (source.apiKeyId) return { kind: "api_key", apiKeyId: source.apiKeyId };
  if (source.interactionId) return { kind: "conversation", interactionId: source.interactionId };
  if (source.createdByUserId) return { kind: "user", userId: source.createdByUserId };
  return undefined;
}

/** Counts terms per glossary, ordered by the first term seen. */
export function glossaryUses(
  terms: ReadonlyArray<{ glossaryId: string; glossaryName: string }>,
): GlossaryUse[] {
  const byId = new Map<string, GlossaryUse>();
  for (const term of terms) {
    const use = byId.get(term.glossaryId);
    if (use) {
      use.termCount += 1;
    } else {
      byId.set(term.glossaryId, {
        glossaryId: term.glossaryId,
        name: term.glossaryName,
        termCount: 1,
      });
    }
  }
  return [...byId.values()];
}

/** Counts matches per translation memory, ordered by the first match seen. */
export function translationMemoryUses(
  matches: ReadonlyArray<{ memoryId: string; memoryName: string }>,
): TranslationMemoryUse[] {
  const byId = new Map<string, TranslationMemoryUse>();
  for (const match of matches) {
    const use = byId.get(match.memoryId);
    if (use) {
      use.matchCount += 1;
    } else {
      byId.set(match.memoryId, {
        memoryId: match.memoryId,
        name: match.memoryName,
        matchCount: 1,
      });
    }
  }
  return [...byId.values()];
}
