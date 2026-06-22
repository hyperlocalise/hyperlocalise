import { withAuth } from "@workos-inc/authkit-nextjs";
import { dedupe } from "flags/next";

import type { AppAuthContext } from "@/lib/workos/app-auth";

import type { WorkosFlagEntities } from "./workos-flag-entities";

export function createWorkosIdentify(
  auth: Pick<AppAuthContext, "activeOrganization" | "user">,
): WorkosFlagEntities {
  return {
    user: { id: auth.user.workosUserId },
    organization: { id: auth.activeOrganization.workosOrganizationId },
  };
}

export const identifyWorkosContextFromSession = dedupe(async (): Promise<WorkosFlagEntities> => {
  const { user, organizationId } = await withAuth({ ensureSignedIn: true });

  return {
    user: user?.id ? { id: user.id } : undefined,
    organization: organizationId ? { id: organizationId } : undefined,
  };
});
