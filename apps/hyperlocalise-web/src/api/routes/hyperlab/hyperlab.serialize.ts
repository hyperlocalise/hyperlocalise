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
import type { schema } from "@/lib/database/client";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export function serializeFlag(flag: typeof schema.experimentFlags.$inferSelect) {
  return {
    id: flag.id,
    organizationId: flag.organizationId,
    key: flag.key,
    description: flag.description,
    kind: flag.kind,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
  };
}

export function serializeFlagConfig(
  config: typeof schema.experimentFlagConfigs.$inferSelect | null,
  flagId: string,
) {
  return {
    flagId,
    value: config?.value ?? null,
    createdAt: iso(config?.createdAt),
    updatedAt: iso(config?.updatedAt),
  };
}

export function serializeAudience(audience: typeof schema.experimentAudiences.$inferSelect) {
  return {
    id: audience.id,
    organizationId: audience.organizationId,
    name: audience.name,
    description: audience.description,
    criterion: audience.criterion,
    createdAt: audience.createdAt.toISOString(),
    updatedAt: audience.updatedAt.toISOString(),
  };
}

export function serializeExperiment(experiment: typeof schema.experiments.$inferSelect) {
  return {
    id: experiment.id,
    organizationId: experiment.organizationId,
    name: experiment.name,
    status: experiment.status,
    kind: experiment.kind,
    audienceId: experiment.audienceId,
    rolloutPercentage: experiment.rolloutPercentage,
    startAt: experiment.startAt.toISOString(),
    endAt: experiment.endAt.toISOString(),
    timezone: experiment.timezone,
    archivedAt: iso(experiment.archivedAt),
    createdAt: experiment.createdAt.toISOString(),
    updatedAt: experiment.updatedAt.toISOString(),
  };
}

export function serializeVariant(variant: typeof schema.experimentVariants.$inferSelect) {
  return {
    id: variant.id,
    experimentId: variant.experimentId,
    key: variant.key,
    audienceId: variant.audienceId,
    rolloutPercentage: variant.rolloutPercentage,
    isControl: variant.isControl,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

export function serializeAllocation(allocation: typeof schema.experimentAllocations.$inferSelect) {
  return {
    id: allocation.id,
    variantId: allocation.variantId,
    start: allocation.start,
    end: allocation.end,
  };
}

export function serializeAssignment(
  assignment: typeof schema.experimentFlagAssignments.$inferSelect,
) {
  return {
    id: assignment.id,
    flagId: assignment.flagId,
    variantId: assignment.variantId,
    enabled: assignment.enabled,
    payload: assignment.payload,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

export function serializeClientKey(key: typeof schema.experimentClientKeys.$inferSelect) {
  return {
    id: key.id,
    organizationId: key.organizationId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: iso(key.lastUsedAt),
    revokedAt: iso(key.revokedAt),
    createdAt: key.createdAt.toISOString(),
  };
}
