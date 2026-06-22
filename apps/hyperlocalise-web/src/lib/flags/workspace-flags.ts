import { redirect } from "next/navigation";
import { flag, type Flag } from "flags/next";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";
import type { AppAuthContext } from "@/lib/workos/app-auth";

import { createWorkosIdentify } from "./identify-workos-context";
import { workosAdapter } from "./workos-adapter";
import {
  WORKSPACE_AUTOMATIONS_FLAG,
  WORKSPACE_KNOWLEDGE_FLAG,
  type WorkosFlagEntities,
  type WorkspaceFeatureFlagState,
} from "./workos-flag-entities";

export const workspaceAutomationsFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_AUTOMATIONS_FLAG,
  defaultValue: false,
  description: "Workspace automations for scheduled and GitHub-triggered workflows.",
  adapter: workosAdapter(),
});

export const workspaceKnowledgeFlag = flag<boolean, WorkosFlagEntities>({
  key: WORKSPACE_KNOWLEDGE_FLAG,
  defaultValue: false,
  description: "Workspace knowledge memory for agents and teams.",
  adapter: workosAdapter(),
});

export async function evaluateWorkspaceFeatureFlags(
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): Promise<WorkspaceFeatureFlagState> {
  const identify = () => createWorkosIdentify(auth);

  const [automations, knowledge] = await Promise.all([
    workspaceAutomationsFlag.run({ identify }),
    workspaceKnowledgeFlag.run({ identify }),
  ]);

  return { automations, knowledge };
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
    redirect(`/org/${organizationSlug}/command-center?reason=feature-unavailable`);
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
