import { Autumn } from "autumn-js";
import { and, count, eq, ne } from "drizzle-orm";

import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getAutumnSecretKey } from "@/lib/billing/autumn-config";
import type { DatabaseClient } from "@/lib/database";
import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export const workspaceResourceFeatureIds = {
  seats: autumnFeatureIds.seats,
  projects: autumnFeatureIds.projects,
  automations: autumnFeatureIds.automations,
  integrations: autumnFeatureIds.integrations,
} as const;

export type WorkspaceResourceFeatureId =
  (typeof workspaceResourceFeatureIds)[keyof typeof workspaceResourceFeatureIds];

export type WorkspaceResourceLimitError =
  | {
      code: "workspace_resource_limit_reached";
      featureId: WorkspaceResourceFeatureId;
      currentUsage: number;
      requestedUsage: number;
    }
  | {
      code: "workspace_resource_limit_check_failed";
      featureId: WorkspaceResourceFeatureId;
      message: string;
    };

const AUTUMN_API_VERSION = "2.2.0";

const localFallbackLimits: Record<WorkspaceResourceFeatureId, number> = {
  [workspaceResourceFeatureIds.seats]: 1,
  [workspaceResourceFeatureIds.projects]: 1,
  [workspaceResourceFeatureIds.automations]: 0,
  [workspaceResourceFeatureIds.integrations]: 2,
};

function countValue(row: { value: number } | undefined) {
  return row?.value ?? 0;
}

async function countWorkspaceResourceUsage(input: {
  db: DatabaseClient;
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
}) {
  switch (input.featureId) {
    case workspaceResourceFeatureIds.seats: {
      const [row] = await input.db
        .select({ value: count() })
        .from(schema.organizationMemberships)
        .where(eq(schema.organizationMemberships.organizationId, input.organizationId));
      return countValue(row);
    }
    case workspaceResourceFeatureIds.projects: {
      const [row] = await input.db
        .select({ value: count() })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.organizationId, input.organizationId),
            eq(schema.projects.isActive, true),
          ),
        );
      return countValue(row);
    }
    case workspaceResourceFeatureIds.automations: {
      const [row] = await input.db
        .select({ value: count() })
        .from(schema.workspaceAutomations)
        .where(
          and(
            eq(schema.workspaceAutomations.organizationId, input.organizationId),
            ne(schema.workspaceAutomations.status, "archived"),
          ),
        );
      return countValue(row);
    }
    case workspaceResourceFeatureIds.integrations:
      return countActiveIntegrations(input.db, input.organizationId);
  }
}

async function countActiveIntegrations(database: DatabaseClient, organizationId: string) {
  const [[tmsCredentials], [githubInstallations], [contentfulConnections], [connectors]] =
    await Promise.all([
      database
        .select({ value: count() })
        .from(schema.organizationExternalTmsProviderCredentials)
        .where(
          eq(schema.organizationExternalTmsProviderCredentials.organizationId, organizationId),
        ),
      database
        .select({ value: count() })
        .from(schema.githubInstallations)
        .where(eq(schema.githubInstallations.organizationId, organizationId)),
      database
        .select({ value: count() })
        .from(schema.contentfulConnections)
        .where(
          and(
            eq(schema.contentfulConnections.organizationId, organizationId),
            eq(schema.contentfulConnections.enabled, true),
          ),
        ),
      database
        .select({ value: count() })
        .from(schema.connectors)
        .where(
          and(
            eq(schema.connectors.organizationId, organizationId),
            eq(schema.connectors.enabled, true),
          ),
        ),
    ]);

  return (
    countValue(tmsCredentials) +
    countValue(githubInstallations) +
    countValue(contentfulConnections) +
    countValue(connectors)
  );
}

function formatLimitCheckError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "workspace_resource_limit_check_failed";
}

async function checkAutumnWorkspaceResourceLimit(input: {
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
  requestedUsage: number;
  autumnApiKey: string;
}) {
  const autumn = new Autumn({
    secretKey: input.autumnApiKey,
    xApiVersion: AUTUMN_API_VERSION,
    failOpen: false,
  });

  const response = await autumn.check({
    customerId: input.organizationId,
    featureId: input.featureId,
    requiredBalance: input.requestedUsage,
    withPreview: true,
  });

  return response.allowed;
}

export async function ensureWorkspaceResourceLimitAvailable(input: {
  db?: DatabaseClient;
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
  additionalUsage?: number;
  autumnApiKey?: string;
}): Promise<Result<void, WorkspaceResourceLimitError>> {
  const database = input.db ?? db;
  const additionalUsage = input.additionalUsage ?? 1;
  if (additionalUsage <= 0) return ok(undefined);
  if (process.env.NODE_ENV === "test" && input.autumnApiKey === undefined) return ok(undefined);

  const currentUsage = await countWorkspaceResourceUsage({
    db: database,
    organizationId: input.organizationId,
    featureId: input.featureId,
  });
  const requestedUsage = currentUsage + additionalUsage;
  const autumnApiKey = input.autumnApiKey ?? getAutumnSecretKey();

  if (!autumnApiKey) {
    const fallbackLimit = localFallbackLimits[input.featureId];
    if (requestedUsage > fallbackLimit) {
      return err({
        code: "workspace_resource_limit_reached",
        featureId: input.featureId,
        currentUsage,
        requestedUsage,
      });
    }

    return ok(undefined);
  }

  try {
    const allowed = await checkAutumnWorkspaceResourceLimit({
      organizationId: input.organizationId,
      featureId: input.featureId,
      requestedUsage,
      autumnApiKey,
    });

    if (!allowed) {
      return err({
        code: "workspace_resource_limit_reached",
        featureId: input.featureId,
        currentUsage,
        requestedUsage,
      });
    }

    return ok(undefined);
  } catch (error) {
    return err({
      code: "workspace_resource_limit_check_failed",
      featureId: input.featureId,
      message: formatLimitCheckError(error),
    });
  }
}

export function workspaceResourceLimitMessage(featureId: WorkspaceResourceFeatureId) {
  switch (featureId) {
    case workspaceResourceFeatureIds.seats:
      return "Seat limit reached for your current plan.";
    case workspaceResourceFeatureIds.projects:
      return "Project limit reached for your current plan.";
    case workspaceResourceFeatureIds.automations:
      return "Automation limit reached for your current plan.";
    case workspaceResourceFeatureIds.integrations:
      return "Integration limit reached for your current plan.";
  }
}

export function workspaceResourceLimitErrorDetails(error: WorkspaceResourceLimitError) {
  return {
    featureId: error.featureId,
    ...(error.code === "workspace_resource_limit_reached"
      ? {
          currentUsage: error.currentUsage,
          requestedUsage: error.requestedUsage,
        }
      : {}),
  };
}
