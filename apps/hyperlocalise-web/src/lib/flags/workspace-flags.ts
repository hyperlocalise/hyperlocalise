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
import { redirect } from "next/navigation";
import { flag, type Flag } from "flags/next";
import { and, eq } from "drizzle-orm";

import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import {
  isAutumnBooleanFeatureEnabled,
  type AutumnBooleanFeatureId,
} from "@/lib/billing/autumn-boolean-feature-access";
import { db, schema } from "@/lib/database/client";
import type { AppAuthContext } from "@/lib/workos/app-auth";

import { createWorkosIdentify } from "./identify-workos-context";
import { workosAdapter } from "./workos-adapter";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_DOMAINS_FLAG,
  WORKSPACE_FEATURE_UNAVAILABLE_REASON,
  WORKSPACE_GLOSSARY_SEARCH_FLAG,
  WORKSPACE_HYPERLAB_FLAG,
  WORKSPACE_REPORTS_FLAG,
  WORKSPACE_VISUAL_MOCK_FLAG,
  type WorkosFlagEntities,
  type WorkspaceFeatureFlagState,
} from "./workos-flag-entities";

export {
  annotateNavigationByWorkspaceFlags,
  annotateNavigationItemsWithWorkspaceFlags,
  filterNavigationByWorkspaceFlags,
  filterNavigationItemsByWorkspaceFlags,
  groupPreviewNavigationGroups,
} from "./workspace-flag-navigation";

export const workspaceAutomationsFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_AUTOMATIONS_FLAG,
  defaultValue: false,
  description: "Workspace automations for scheduled and GitHub-triggered workflows.",
  adapter: workosAdapter(),
});

export const workspaceVisualMockFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_VISUAL_MOCK_FLAG,
  defaultValue: false,
  description: "Visual mock skill for repository-backed Hyperlocalise agent previews.",
  adapter: workosAdapter(),
});

export const workspaceDomainsFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_DOMAINS_FLAG,
  defaultValue: false,
  description: "Workspace domains for claimed sites and localisation audit reports.",
  adapter: workosAdapter(),
});

export const workspaceGlossarySearchFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_GLOSSARY_SEARCH_FLAG,
  defaultValue: false,
  description:
    "Conversational agent glossary search (native and Crowdin) for terminology-safe advice.",
  adapter: workosAdapter(),
});

export const workspaceHyperlabFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_HYPERLAB_FLAG,
  defaultValue: false,
  description: "Hyperlab experiments and feature flags for customer applications.",
  adapter: workosAdapter(),
});

export const workspaceReportsFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_REPORTS_FLAG,
  defaultValue: false,
  description: "Workspace translation reports for word counts, time, and cost.",
  adapter: workosAdapter(),
});

export async function evaluateWorkspaceFeatureFlags(
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<WorkspaceFeatureFlagState> {
  const identify = () => createWorkosIdentify(auth);
  const organizationId = auth.activeOrganization.localOrganizationId;

  const [
    automations,
    knowledge,
    visualMock,
    domains,
    glossarySearch,
    hyperlab,
    reports,
    visualWorkflows,
    queriesBoard,
  ] = await Promise.all([
    workspaceAutomationsFlag.run({ identify }),
    isAutumnBooleanFeatureEnabled({
      organizationId,
      featureId: autumnFeatureIds.guidelines,
    }),
    workspaceVisualMockFlag.run({ identify }),
    workspaceDomainsFlag.run({ identify }),
    workspaceGlossarySearchFlag.run({ identify }),
    workspaceHyperlabFlag.run({ identify }),
    workspaceReportsFlag.run({ identify }),
    isAutumnBooleanFeatureEnabled({
      organizationId,
      featureId: autumnFeatureIds.automationWorkflow,
    }),
    isAutumnBooleanFeatureEnabled({
      organizationId,
      featureId: autumnFeatureIds.queriesBoard,
    }),
  ]);

  return {
    automations,
    knowledge,
    visualMock,
    visualWorkflows,
    queriesBoard,
    domains,
    glossarySearch,
    hyperlab,
    reports,
  };
}

export async function getAutumnWorkspaceBooleanFeatureEnabled(
  featureId: AutumnBooleanFeatureId,
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<boolean> {
  return isAutumnBooleanFeatureEnabled({
    organizationId: auth.activeOrganization.localOrganizationId,
    featureId,
  });
}

export async function requireAutumnWorkspaceBooleanFeature(
  featureId: AutumnBooleanFeatureId,
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
) {
  const enabled = await getAutumnWorkspaceBooleanFeatureEnabled(featureId, auth);

  if (enabled) {
    return;
  }

  const organizationSlug = auth.activeOrganization.slug;
  if (organizationSlug) {
    redirect(`/org/${organizationSlug}/dashboard?reason=${WORKSPACE_FEATURE_UNAVAILABLE_REASON}`);
  }

  redirect("/auth/select-organization");
}

export async function resolveWorkspaceVisualMockFlag(input: {
  organizationId: string;
  localUserId: string;
  dbClient?: Pick<typeof db, "select">;
}) {
  const dbClient = input.dbClient ?? db;
  if (typeof dbClient.select !== "function") {
    return false;
  }

  try {
    const [identity] = await dbClient
      .select({
        workosOrganizationId: schema.organizations.workosOrganizationId,
        workosUserId: schema.users.workosUserId,
      })
      .from(schema.organizationMemberships)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.organizationMemberships.organizationId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
      .where(
        and(
          eq(schema.organizationMemberships.organizationId, input.organizationId),
          eq(schema.organizationMemberships.userId, input.localUserId),
        ),
      )
      .limit(1);

    if (!identity) {
      return false;
    }

    return workspaceVisualMockFlag.run({
      identify: () => ({
        organization: { id: identity.workosOrganizationId },
        user: { id: identity.workosUserId },
      }),
    });
  } catch {
    return false;
  }
}

async function resolveWorkspaceOrganizationFlag(
  workspaceFlag: Flag<boolean, WorkosFlagEntities>,
  input: {
    organizationId: string;
    dbClient?: Pick<typeof db, "select">;
  },
): Promise<boolean> {
  const dbClient = input.dbClient ?? db;
  if (typeof dbClient.select !== "function") {
    return false;
  }

  try {
    const [organization] = await dbClient
      .select({ workosOrganizationId: schema.organizations.workosOrganizationId })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, input.organizationId))
      .limit(1);

    if (!organization) {
      return false;
    }

    return (
      (await workspaceFlag.run({
        identify: () => ({ organization: { id: organization.workosOrganizationId } }),
      })) === true
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the Autumn `guidelines` entitlement from an internal organizationId. Works for
 * callers with no live HTTP auth context — background jobs, queue workers, and
 * workspace-automation tool calls — as well as API routes.
 *
 * An automation's stored toolConfig (set once, possibly before the plan lost Guidelines, or via
 * direct API access that skips UI validation) could otherwise keep reaching recall_memory and
 * reading guideline documents on a schedule. Call this at the point of use, not just at
 * config-save time, so losing the entitlement actually stops in-flight automations too.
 */
export async function resolveWorkspaceKnowledgeFlag(input: {
  organizationId: string;
}): Promise<boolean> {
  try {
    return await isAutumnBooleanFeatureEnabled({
      organizationId: input.organizationId,
      featureId: autumnFeatureIds.guidelines,
    });
  } catch {
    return false;
  }
}

/**
 * Resolves workspaceReportsFlag from an internal organizationId for background jobs.
 * Reports API routes and nav already hide the UI, but capture still ran TM matching on
 * every translation job. Check at the point of capture so a disabled flag actually skips work.
 */
export async function resolveWorkspaceReportsFlag(input: {
  organizationId: string;
  dbClient?: Pick<typeof db, "select">;
}): Promise<boolean> {
  return resolveWorkspaceOrganizationFlag(workspaceReportsFlag, input);
}

export async function getWorkspaceFeatureFlagEnabled(
  workspaceFlag: Flag<boolean, WorkosFlagEntities>,
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<boolean> {
  try {
    return (await workspaceFlag.run({ identify: () => createWorkosIdentify(auth) })) === true;
  } catch {
    return false;
  }
}

export async function requireWorkspaceFeatureFlag(
  workspaceFlag: Flag<boolean, WorkosFlagEntities>,
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
) {
  const enabled = await workspaceFlag.run({ identify: () => createWorkosIdentify(auth) });

  if (enabled) {
    return;
  }

  const organizationSlug = auth.activeOrganization.slug;
  if (organizationSlug) {
    redirect(`/org/${organizationSlug}/dashboard?reason=${WORKSPACE_FEATURE_UNAVAILABLE_REASON}`);
  }

  redirect("/auth/select-organization");
}
