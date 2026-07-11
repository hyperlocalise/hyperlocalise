import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import type { ReadonlyHeaders, ReadonlyRequestCookies } from "flags";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";
import { db, schema } from "@/lib/database";
import type { AppAuthContext } from "@/lib/workos/app-auth";

import { createWorkosIdentify } from "./identify-workos-context";
import {
  workspaceAutomationsFlagDefinition,
  workspaceKnowledgeFlagDefinition,
  workspaceVisualMockFlagDefinition,
  type WorkspaceFlagDefinition,
} from "./workspace-flag-definitions";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_FEATURE_UNAVAILABLE_REASON,
  WORKSPACE_KNOWLEDGE_FLAG,
  WORKSPACE_VISUAL_MOCK_FLAG,
  type WorkosFlagEntities,
  type WorkspaceFeatureFlagState,
} from "./workos-flag-entities";

type WorkspaceFlagRunInput = {
  identify: () => WorkosFlagEntities;
};

type WorkspaceFlag = {
  run(input: WorkspaceFlagRunInput): Promise<boolean>;
};

const emptyHeaders = {} as ReadonlyHeaders;
const emptyCookies = {} as ReadonlyRequestCookies;

function createWorkspaceFlag(definition: WorkspaceFlagDefinition): WorkspaceFlag {
  return {
    async run(input) {
      try {
        const value = await definition.adapter.decide({
          key: definition.key,
          entities: input.identify(),
          headers: emptyHeaders,
          cookies: emptyCookies,
          defaultValue: definition.defaultValue,
        });
        return value ?? definition.defaultValue;
      } catch {
        return definition.defaultValue;
      }
    },
  };
}

export const workspaceAutomationsFlag = createWorkspaceFlag(workspaceAutomationsFlagDefinition);

export const workspaceKnowledgeFlag = createWorkspaceFlag(workspaceKnowledgeFlagDefinition);

export const workspaceVisualMockFlag = createWorkspaceFlag(workspaceVisualMockFlagDefinition);

export async function evaluateWorkspaceFeatureFlags(
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<WorkspaceFeatureFlagState> {
  const identify = () => createWorkosIdentify(auth);

  const [automations, knowledge, visualMock] = await Promise.all([
    workspaceAutomationsFlag.run({ identify }),
    workspaceKnowledgeFlag.run({ identify }),
    workspaceVisualMockFlag.run({ identify }),
  ]);

  return { automations, knowledge, visualMock };
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

export async function resolveWorkspaceKnowledgeFlag(input: {
  organizationId: string;
  localUserId?: string;
  dbClient?: Pick<typeof db, "select">;
}) {
  const dbClient = input.dbClient ?? db;
  if (typeof dbClient.select !== "function") {
    return false;
  }

  try {
    const [organization] = await dbClient
      .select({
        workosOrganizationId: schema.organizations.workosOrganizationId,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, input.organizationId))
      .limit(1);

    if (!organization) {
      return false;
    }

    let workosUserId: string | undefined;
    if (input.localUserId) {
      const [user] = await dbClient
        .select({ workosUserId: schema.users.workosUserId })
        .from(schema.users)
        .where(eq(schema.users.id, input.localUserId))
        .limit(1);
      workosUserId = user?.workosUserId;
    }

    return workspaceKnowledgeFlag.run({
      identify: () => ({
        organization: { id: organization.workosOrganizationId },
        user: workosUserId ? { id: workosUserId } : undefined,
      }),
    });
  } catch {
    return false;
  }
}

export async function requireWorkspaceFeatureFlag(
  workspaceFlag: WorkspaceFlag,
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

export function filterNavigationByWorkspaceFlags(
  groups: readonly NavigationGroup[],
  flags: WorkspaceFeatureFlagState,
): readonly NavigationGroup[] {
  const enabledByKey: Record<string, boolean> = {
    [WORKSPACE_AUTOMATIONS_FLAG]: flags.automations,
    [WORKSPACE_KNOWLEDGE_FLAG]: flags.knowledge,
    [WORKSPACE_VISUAL_MOCK_FLAG]: flags.visualMock,
  };

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.featureFlagKey) {
          return true;
        }

        return enabledByKey[item.featureFlagKey] ?? false;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
