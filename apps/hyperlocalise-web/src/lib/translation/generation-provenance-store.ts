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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import {
  generationProvenanceSchema,
  generationTriggerFromJobSource,
  parseGenerationTrigger,
  type GenerationProvenance,
} from "@/lib/translation/generation-provenance";

/**
 * Stores what the job gave the model. Keeps a trigger recorded when the job was enqueued, and
 * falls back to the job row's API key, conversation or creator.
 */
export async function recordJobGenerationProvenance(
  jobId: string,
  provenance: Omit<GenerationProvenance, "trigger">,
): Promise<GenerationProvenance | null> {
  const [job] = await db
    .select({
      generationProvenance: schema.jobs.generationProvenance,
      apiKeyId: schema.jobs.apiKeyId,
      interactionId: schema.jobs.interactionId,
      createdByUserId: schema.jobs.createdByUserId,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);
  if (!job) return null;

  const trigger =
    parseGenerationTrigger(job.generationProvenance?.trigger) ??
    generationTriggerFromJobSource(job);
  const stored = generationProvenanceSchema.parse({
    ...provenance,
    ...(trigger ? { trigger } : {}),
  });

  await db
    .update(schema.jobs)
    .set({ generationProvenance: stored })
    .where(eq(schema.jobs.id, jobId));

  return stored;
}
