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
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import type { ZodType } from "zod";

import { hasCapability } from "@/api/auth/policy";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { createWorkspaceFeatureFlagMiddleware } from "@/api/middleware/workspace-feature-flag";
import { validationErrorResponse } from "@/api/errors";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
} from "@/api/response.schema";
import { db, schema } from "@/lib/database/client";
import {
  generateExperimentClientKey,
  getExperimentClientKeyPrefix,
  hashExperimentClientKey,
} from "@/lib/experiments/client-keys";
import { generateExperimentSeed } from "@/lib/experiments/allocations";
import { workspaceHyperlabFlag } from "@/lib/flags/workspace-flags";
import { isErr } from "@/lib/primitives/result/results";

import {
  assignmentIdParamsSchema,
  audienceIdParamsSchema,
  clientKeyIdParamsSchema,
  createAssignmentBodySchema,
  createAudienceBodySchema,
  createClientKeyBodySchema,
  createExperimentBodySchema,
  createFlagBodySchema,
  createVariantBodySchema,
  experimentIdParamsSchema,
  flagIdParamsSchema,
  updateAssignmentBodySchema,
  updateAudienceBodySchema,
  updateExperimentBodySchema,
  updateFlagBodySchema,
  updateVariantBodySchema,
  upsertFlagConfigBodySchema,
  variantIdParamsSchema,
} from "./hyperlab.schema";
import {
  serializeAllocation,
  serializeAssignment,
  serializeAudience,
  serializeClientKey,
  serializeExperiment,
  serializeFlag,
  serializeFlagConfig,
  serializeVariant,
} from "./hyperlab.serialize";
import {
  assertAudienceInOrganization,
  getExperimentFlag,
  getExperimentFlagConfig,
  listExperimentFlags,
  recomputeExperimentAllocations,
} from "@/lib/experiments/store";

function validateJson<T>(schema: ZodType<T>, error: string) {
  return validator("json", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return validationErrorResponse(c, error, "Request payload is invalid", parsed.error.issues);
    }
    return parsed.data;
  });
}

function validateParams<T>(schema: ZodType<T>) {
  return validator("param", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return notFoundResponse(c, "not_found");
    }
    return parsed.data;
  });
}

function canWrite(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "experiments:write");
}

function canRead(role: AuthVariables["auth"]["membership"]["role"]) {
  return hasCapability(role, "experiments:read");
}

function defaultExperimentEndAt() {
  const end = new Date();
  end.setUTCMonth(end.getUTCMonth() + 3);
  return end;
}

export function createHyperlabRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use(
      "*",
      createWorkspaceFeatureFlagMiddleware(
        workspaceHyperlabFlag,
        "Hyperlab is not enabled for this workspace",
      ),
    )
    .use("*", async (c, next) => {
      if (!canRead(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:read");
      }
      await next();
    })
    .get("/flags", async (c) => {
      const flags = await listExperimentFlags(c.var.auth.organization.id);
      return c.json({ flags: flags.map(serializeFlag) }, 200);
    })
    .post("/flags", validateJson(createFlagBodySchema, "invalid_flag_payload"), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const body = c.req.valid("json");
      try {
        const [flag] = await db
          .insert(schema.experimentFlags)
          .values({
            organizationId: c.var.auth.organization.id,
            key: body.key,
            description: body.description,
            kind: body.kind,
          })
          .returning();
        return c.json({ flag: serializeFlag(flag) }, 201);
      } catch {
        return conflictResponse(c, "flag_key_taken", "A flag with this key already exists");
      }
    })
    .get("/flags/:flagId", validateParams(flagIdParamsSchema), async (c) => {
      const flag = await getExperimentFlag(c.var.auth.organization.id, c.req.valid("param").flagId);
      if (!flag) {
        return notFoundResponse(c, "flag_not_found");
      }
      const config = await getExperimentFlagConfig(flag.id);
      return c.json({ flag: serializeFlag(flag), config: serializeFlagConfig(config, flag.id) }, 200);
    })
    .put(
      "/flags/:flagId",
      validateParams(flagIdParamsSchema),
      validateJson(updateFlagBodySchema, "invalid_flag_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const { flagId } = c.req.valid("param");
        const body = c.req.valid("json");
        const [flag] = await db
          .update(schema.experimentFlags)
          .set({ description: body.description ?? undefined })
          .where(
            and(
              eq(schema.experimentFlags.id, flagId),
              eq(schema.experimentFlags.organizationId, c.var.auth.organization.id),
            ),
          )
          .returning();
        if (!flag) {
          return notFoundResponse(c, "flag_not_found");
        }
        return c.json({ flag: serializeFlag(flag) }, 200);
      },
    )
    .put(
      "/flags/:flagId/config",
      validateParams(flagIdParamsSchema),
      validateJson(upsertFlagConfigBodySchema, "invalid_flag_config_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const flag = await getExperimentFlag(c.var.auth.organization.id, c.req.valid("param").flagId);
        if (!flag) {
          return notFoundResponse(c, "flag_not_found");
        }
        if (flag.kind !== "config") {
          return badRequestResponse(c, "flag_not_config", "Only config flags have a JSON value");
        }
        const body = c.req.valid("json");
        const [config] = await db
          .insert(schema.experimentFlagConfigs)
          .values({ flagId: flag.id, value: body.value })
          .onConflictDoUpdate({
            target: schema.experimentFlagConfigs.flagId,
            set: { value: body.value, updatedAt: new Date() },
          })
          .returning();
        return c.json({ config: serializeFlagConfig(config, flag.id) }, 200);
      },
    )
    .delete("/flags/:flagId", validateParams(flagIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const deleted = await db
        .delete(schema.experimentFlags)
        .where(
          and(
            eq(schema.experimentFlags.id, c.req.valid("param").flagId),
            eq(schema.experimentFlags.organizationId, c.var.auth.organization.id),
          ),
        )
        .returning({ id: schema.experimentFlags.id });
      if (deleted.length === 0) {
        return notFoundResponse(c, "flag_not_found");
      }
      return c.body(null, 204);
    })
    .get("/audiences", async (c) => {
      const audiences = await db
        .select()
        .from(schema.experimentAudiences)
        .where(eq(schema.experimentAudiences.organizationId, c.var.auth.organization.id))
        .orderBy(desc(schema.experimentAudiences.createdAt));
      return c.json({ audiences: audiences.map(serializeAudience) }, 200);
    })
    .post(
      "/audiences",
      validateJson(createAudienceBodySchema, "invalid_audience_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const [audience] = await db
          .insert(schema.experimentAudiences)
          .values({
            organizationId: c.var.auth.organization.id,
            name: body.name,
            description: body.description,
            criterion: body.criterion ?? null,
          })
          .returning();
        return c.json({ audience: serializeAudience(audience) }, 201);
      },
    )
    .get("/audiences/:audienceId", validateParams(audienceIdParamsSchema), async (c) => {
      const [audience] = await db
        .select()
        .from(schema.experimentAudiences)
        .where(
          and(
            eq(schema.experimentAudiences.id, c.req.valid("param").audienceId),
            eq(schema.experimentAudiences.organizationId, c.var.auth.organization.id),
          ),
        )
        .limit(1);
      if (!audience) {
        return notFoundResponse(c, "audience_not_found");
      }
      return c.json({ audience: serializeAudience(audience) }, 200);
    })
    .put(
      "/audiences/:audienceId",
      validateParams(audienceIdParamsSchema),
      validateJson(updateAudienceBodySchema, "invalid_audience_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const [audience] = await db
          .update(schema.experimentAudiences)
          .set({
            name: body.name,
            description: body.description === undefined ? undefined : body.description,
            criterion: body.criterion === undefined ? undefined : body.criterion,
          })
          .where(
            and(
              eq(schema.experimentAudiences.id, c.req.valid("param").audienceId),
              eq(schema.experimentAudiences.organizationId, c.var.auth.organization.id),
            ),
          )
          .returning();
        if (!audience) {
          return notFoundResponse(c, "audience_not_found");
        }
        return c.json({ audience: serializeAudience(audience) }, 200);
      },
    )
    .delete("/audiences/:audienceId", validateParams(audienceIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const deleted = await db
        .delete(schema.experimentAudiences)
        .where(
          and(
            eq(schema.experimentAudiences.id, c.req.valid("param").audienceId),
            eq(schema.experimentAudiences.organizationId, c.var.auth.organization.id),
          ),
        )
        .returning({ id: schema.experimentAudiences.id });
      if (deleted.length === 0) {
        return notFoundResponse(c, "audience_not_found");
      }
      return c.body(null, 204);
    })
    .get("/experiments", async (c) => {
      const rows = await db
        .select()
        .from(schema.experiments)
        .where(eq(schema.experiments.organizationId, c.var.auth.organization.id))
        .orderBy(desc(schema.experiments.createdAt));
      return c.json({ experiments: rows.map(serializeExperiment) }, 200);
    })
    .post(
      "/experiments",
      validateJson(createExperimentBodySchema, "invalid_experiment_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const audience = await assertAudienceInOrganization(
          c.var.auth.organization.id,
          body.audienceId,
        );
        if (isErr(audience)) {
          return notFoundResponse(c, "audience_not_found");
        }
        const startAt = body.startAt ? new Date(body.startAt) : new Date();
        const endAt = body.endAt ? new Date(body.endAt) : defaultExperimentEndAt();
        if (endAt <= startAt) {
          return badRequestResponse(c, "invalid_experiment_window", "endAt must be after startAt");
        }
        const [experiment] = await db
          .insert(schema.experiments)
          .values({
            organizationId: c.var.auth.organization.id,
            name: body.name,
            kind: body.kind,
            audienceId: body.audienceId ?? null,
            rolloutPercentage: body.rolloutPercentage ?? 10000,
            seed: generateExperimentSeed(),
            startAt,
            endAt,
            timezone: body.timezone ?? "UTC",
          })
          .returning();
        return c.json({ experiment: serializeExperiment(experiment) }, 201);
      },
    )
    .get("/experiments/:experimentId", validateParams(experimentIdParamsSchema), async (c) => {
      const [experiment] = await db
        .select()
        .from(schema.experiments)
        .where(
          and(
            eq(schema.experiments.id, c.req.valid("param").experimentId),
            eq(schema.experiments.organizationId, c.var.auth.organization.id),
          ),
        )
        .limit(1);
      if (!experiment) {
        return notFoundResponse(c, "experiment_not_found");
      }
      const variants = await db
        .select()
        .from(schema.experimentVariants)
        .where(eq(schema.experimentVariants.experimentId, experiment.id))
        .orderBy(schema.experimentVariants.createdAt);
      const allocations =
        variants.length === 0
          ? []
          : await db
              .select()
              .from(schema.experimentAllocations)
              .where(
                inArray(
                  schema.experimentAllocations.variantId,
                  variants.map((variant) => variant.id),
                ),
              );
      return c.json(
        {
          experiment: serializeExperiment(experiment),
          variants: variants.map(serializeVariant),
          allocations: allocations.map(serializeAllocation),
        },
        200,
      );
    })
    .put(
      "/experiments/:experimentId",
      validateParams(experimentIdParamsSchema),
      validateJson(updateExperimentBodySchema, "invalid_experiment_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const audience = await assertAudienceInOrganization(
          c.var.auth.organization.id,
          body.audienceId,
        );
        if (isErr(audience)) {
          return notFoundResponse(c, "audience_not_found");
        }
        const [current] = await db
          .select()
          .from(schema.experiments)
          .where(
            and(
              eq(schema.experiments.id, c.req.valid("param").experimentId),
              eq(schema.experiments.organizationId, c.var.auth.organization.id),
            ),
          )
          .limit(1);
        if (!current) {
          return notFoundResponse(c, "experiment_not_found");
        }
        const startAt = body.startAt ? new Date(body.startAt) : current.startAt;
        const endAt = body.endAt ? new Date(body.endAt) : current.endAt;
        if (endAt <= startAt) {
          return badRequestResponse(c, "invalid_experiment_window", "endAt must be after startAt");
        }
        const [experiment] = await db
          .update(schema.experiments)
          .set({
            name: body.name,
            status: body.status,
            audienceId: body.audienceId === undefined ? undefined : body.audienceId,
            rolloutPercentage: body.rolloutPercentage,
            startAt,
            endAt,
            timezone: body.timezone,
            archivedAt: body.status === "archived" ? (current.archivedAt ?? new Date()) : body.status ? null : undefined,
          })
          .where(eq(schema.experiments.id, current.id))
          .returning();
        if (body.rolloutPercentage !== undefined) {
          await recomputeExperimentAllocations(experiment.id);
        }
        return c.json({ experiment: serializeExperiment(experiment) }, 200);
      },
    )
    .delete("/experiments/:experimentId", validateParams(experimentIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const deleted = await db
        .delete(schema.experiments)
        .where(
          and(
            eq(schema.experiments.id, c.req.valid("param").experimentId),
            eq(schema.experiments.organizationId, c.var.auth.organization.id),
          ),
        )
        .returning({ id: schema.experiments.id });
      if (deleted.length === 0) {
        return notFoundResponse(c, "experiment_not_found");
      }
      return c.body(null, 204);
    })
    .post(
      "/experiments/:experimentId/variants",
      validateParams(experimentIdParamsSchema),
      validateJson(createVariantBodySchema, "invalid_variant_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const { experimentId } = c.req.valid("param");
        const [experiment] = await db
          .select({ id: schema.experiments.id })
          .from(schema.experiments)
          .where(
            and(
              eq(schema.experiments.id, experimentId),
              eq(schema.experiments.organizationId, c.var.auth.organization.id),
            ),
          )
          .limit(1);
        if (!experiment) {
          return notFoundResponse(c, "experiment_not_found");
        }
        const body = c.req.valid("json");
        const audience = await assertAudienceInOrganization(
          c.var.auth.organization.id,
          body.audienceId,
        );
        if (isErr(audience)) {
          return notFoundResponse(c, "audience_not_found");
        }
        try {
          const [variant] = await db
            .insert(schema.experimentVariants)
            .values({
              experimentId: experiment.id,
              key: body.key,
              audienceId: body.audienceId ?? null,
              rolloutPercentage: body.rolloutPercentage ?? 10000,
              isControl: body.isControl ?? false,
            })
            .returning();
          await recomputeExperimentAllocations(experiment.id);
          return c.json({ variant: serializeVariant(variant) }, 201);
        } catch {
          return conflictResponse(c, "variant_key_taken", "A variant with this key already exists");
        }
      },
    )
    .put(
      "/variants/:variantId",
      validateParams(variantIdParamsSchema),
      validateJson(updateVariantBodySchema, "invalid_variant_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const audience = await assertAudienceInOrganization(
          c.var.auth.organization.id,
          body.audienceId,
        );
        if (isErr(audience)) {
          return notFoundResponse(c, "audience_not_found");
        }
        const [current] = await db
          .select({
            id: schema.experimentVariants.id,
            experimentId: schema.experimentVariants.experimentId,
          })
          .from(schema.experimentVariants)
          .innerJoin(schema.experiments, eq(schema.experiments.id, schema.experimentVariants.experimentId))
          .where(
            and(
              eq(schema.experimentVariants.id, c.req.valid("param").variantId),
              eq(schema.experiments.organizationId, c.var.auth.organization.id),
            ),
          )
          .limit(1);
        if (!current) {
          return notFoundResponse(c, "variant_not_found");
        }
        const [variant] = await db
          .update(schema.experimentVariants)
          .set({
            audienceId: body.audienceId === undefined ? undefined : body.audienceId,
            rolloutPercentage: body.rolloutPercentage,
            isControl: body.isControl,
          })
          .where(eq(schema.experimentVariants.id, current.id))
          .returning();
        if (!variant) {
          return notFoundResponse(c, "variant_not_found");
        }
        if (body.rolloutPercentage !== undefined) {
          await recomputeExperimentAllocations(variant.experimentId);
        }
        return c.json({ variant: serializeVariant(variant) }, 200);
      },
    )
    .delete("/variants/:variantId", validateParams(variantIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const [variant] = await db
        .select()
        .from(schema.experimentVariants)
        .where(eq(schema.experimentVariants.id, c.req.valid("param").variantId))
        .limit(1);
      if (!variant) {
        return notFoundResponse(c, "variant_not_found");
      }
      const [owned] = await db
        .select({ id: schema.experiments.id })
        .from(schema.experiments)
        .where(
          and(
            eq(schema.experiments.id, variant.experimentId),
            eq(schema.experiments.organizationId, c.var.auth.organization.id),
          ),
        )
        .limit(1);
      if (!owned) {
        return notFoundResponse(c, "variant_not_found");
      }
      await db.delete(schema.experimentVariants).where(eq(schema.experimentVariants.id, variant.id));
      await recomputeExperimentAllocations(variant.experimentId);
      return c.body(null, 204);
    })
    .get("/assignments", async (c) => {
      const flags = await listExperimentFlags(c.var.auth.organization.id);
      if (flags.length === 0) {
        return c.json({ assignments: [] }, 200);
      }
      const assignments = await db
        .select()
        .from(schema.experimentFlagAssignments)
        .where(
          inArray(
            schema.experimentFlagAssignments.flagId,
            flags.map((flag) => flag.id),
          ),
        )
        .orderBy(desc(schema.experimentFlagAssignments.createdAt));
      return c.json({ assignments: assignments.map(serializeAssignment) }, 200);
    })
    .post(
      "/assignments",
      validateJson(createAssignmentBodySchema, "invalid_assignment_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const flag = await getExperimentFlag(c.var.auth.organization.id, body.flagId);
        if (!flag) {
          return notFoundResponse(c, "flag_not_found");
        }
        const [variant] = await db
          .select({
            id: schema.experimentVariants.id,
            experimentOrganizationId: schema.experiments.organizationId,
          })
          .from(schema.experimentVariants)
          .innerJoin(schema.experiments, eq(schema.experiments.id, schema.experimentVariants.experimentId))
          .where(
            and(
              eq(schema.experimentVariants.id, body.variantId),
              eq(schema.experiments.organizationId, c.var.auth.organization.id),
            ),
          )
          .limit(1);
        if (!variant) {
          return notFoundResponse(c, "variant_not_found");
        }
        try {
          const [assignment] = await db
            .insert(schema.experimentFlagAssignments)
            .values({
              flagId: flag.id,
              variantId: variant.id,
              enabled: body.enabled ?? true,
              payload: body.payload ?? null,
            })
            .returning();
          return c.json({ assignment: serializeAssignment(assignment) }, 201);
        } catch {
          return conflictResponse(c, "assignment_exists", "This flag is already attached to the variant");
        }
      },
    )
    .put(
      "/assignments/:assignmentId",
      validateParams(assignmentIdParamsSchema),
      validateJson(updateAssignmentBodySchema, "invalid_assignment_payload"),
      async (c) => {
        if (!canWrite(c.var.auth.membership.role)) {
          return forbiddenResponse(c, "forbidden", "Missing experiments:write");
        }
        const body = c.req.valid("json");
        const [current] = await db
          .select({
            id: schema.experimentFlagAssignments.id,
            flagId: schema.experimentFlagAssignments.flagId,
          })
          .from(schema.experimentFlagAssignments)
          .where(eq(schema.experimentFlagAssignments.id, c.req.valid("param").assignmentId))
          .limit(1);
        if (!current) {
          return notFoundResponse(c, "assignment_not_found");
        }
        const flag = await getExperimentFlag(c.var.auth.organization.id, current.flagId);
        if (!flag) {
          return notFoundResponse(c, "assignment_not_found");
        }
        const [assignment] = await db
          .update(schema.experimentFlagAssignments)
          .set({
            enabled: body.enabled,
            payload: body.payload === undefined ? undefined : body.payload,
          })
          .where(eq(schema.experimentFlagAssignments.id, current.id))
          .returning();
        if (!assignment) {
          return notFoundResponse(c, "assignment_not_found");
        }
        return c.json({ assignment: serializeAssignment(assignment) }, 200);
      },
    )
    .delete("/assignments/:assignmentId", validateParams(assignmentIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const [assignment] = await db
        .select()
        .from(schema.experimentFlagAssignments)
        .where(eq(schema.experimentFlagAssignments.id, c.req.valid("param").assignmentId))
        .limit(1);
      if (!assignment) {
        return notFoundResponse(c, "assignment_not_found");
      }
      const flag = await getExperimentFlag(c.var.auth.organization.id, assignment.flagId);
      if (!flag) {
        return notFoundResponse(c, "assignment_not_found");
      }
      await db
        .delete(schema.experimentFlagAssignments)
        .where(eq(schema.experimentFlagAssignments.id, assignment.id));
      return c.body(null, 204);
    })
    .get("/keys", async (c) => {
      const keys = await db
        .select()
        .from(schema.experimentClientKeys)
        .where(eq(schema.experimentClientKeys.organizationId, c.var.auth.organization.id))
        .orderBy(desc(schema.experimentClientKeys.createdAt));
      return c.json({ keys: keys.map(serializeClientKey) }, 200);
    })
    .post("/keys", validateJson(createClientKeyBodySchema, "invalid_client_key_payload"), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const body = c.req.valid("json");
      const plainKey = generateExperimentClientKey();
      const [key] = await db
        .insert(schema.experimentClientKeys)
        .values({
          organizationId: c.var.auth.organization.id,
          name: body.name,
          keyHash: hashExperimentClientKey(plainKey),
          keyPrefix: getExperimentClientKeyPrefix(plainKey),
          createdByUserId: c.var.auth.user.id,
        })
        .returning();
      return c.json({ key: { ...serializeClientKey(key), secret: plainKey } }, 201);
    })
    .delete("/keys/:keyId", validateParams(clientKeyIdParamsSchema), async (c) => {
      if (!canWrite(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden", "Missing experiments:write");
      }
      const [key] = await db
        .update(schema.experimentClientKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.experimentClientKeys.id, c.req.valid("param").keyId),
            eq(schema.experimentClientKeys.organizationId, c.var.auth.organization.id),
          ),
        )
        .returning();
      if (!key) {
        return notFoundResponse(c, "key_not_found");
      }
      return c.json({ key: serializeClientKey(key) }, 200);
    });
}
