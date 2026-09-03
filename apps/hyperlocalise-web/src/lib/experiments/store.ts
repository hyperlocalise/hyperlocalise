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
import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { calculateAllocationRanges } from "./allocations";

export type ExperimentStoreError =
  | { code: "not_found" }
  | { code: "conflict"; message: string }
  | { code: "invalid"; message: string };

export async function listExperimentFlags(organizationId: string) {
  return db
    .select()
    .from(schema.experimentFlags)
    .where(eq(schema.experimentFlags.organizationId, organizationId))
    .orderBy(desc(schema.experimentFlags.createdAt));
}

export async function getExperimentFlag(organizationId: string, flagId: string) {
  const [flag] = await db
    .select()
    .from(schema.experimentFlags)
    .where(
      and(
        eq(schema.experimentFlags.organizationId, organizationId),
        eq(schema.experimentFlags.id, flagId),
      ),
    )
    .limit(1);
  return flag ?? null;
}

export async function getExperimentFlagConfig(flagId: string) {
  const [config] = await db
    .select()
    .from(schema.experimentFlagConfigs)
    .where(eq(schema.experimentFlagConfigs.flagId, flagId))
    .limit(1);
  return config ?? null;
}

export async function recomputeExperimentAllocations(experimentId: string) {
  const [experiment] = await db
    .select({
      id: schema.experiments.id,
      rolloutPercentage: schema.experiments.rolloutPercentage,
    })
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId))
    .limit(1);

  if (!experiment) {
    return;
  }

  const variants = await db
    .select({
      id: schema.experimentVariants.id,
      rolloutPercentage: schema.experimentVariants.rolloutPercentage,
    })
    .from(schema.experimentVariants)
    .where(eq(schema.experimentVariants.experimentId, experimentId))
    .orderBy(schema.experimentVariants.createdAt);

  const ranges = calculateAllocationRanges(
    experiment.rolloutPercentage,
    variants.map((variant) => variant.rolloutPercentage),
  );

  await db.transaction(async (tx) => {
    for (const variant of variants) {
      await tx
        .delete(schema.experimentAllocations)
        .where(eq(schema.experimentAllocations.variantId, variant.id));
    }

    const rows = variants.flatMap((variant, index) => {
      const range = ranges[index];
      if (!range) {
        return [];
      }
      return [
        {
          variantId: variant.id,
          start: range.start,
          end: range.end,
        },
      ];
    });

    if (rows.length > 0) {
      await tx.insert(schema.experimentAllocations).values(rows);
    }
  });
}

export async function assertAudienceInOrganization(
  organizationId: string,
  audienceId: string | null | undefined,
): Promise<Result<void, ExperimentStoreError>> {
  if (!audienceId) {
    return ok(undefined);
  }

  const [audience] = await db
    .select({ id: schema.experimentAudiences.id })
    .from(schema.experimentAudiences)
    .where(
      and(
        eq(schema.experimentAudiences.organizationId, organizationId),
        eq(schema.experimentAudiences.id, audienceId),
      ),
    )
    .limit(1);

  if (!audience) {
    return err({ code: "not_found" });
  }

  return ok(undefined);
}
