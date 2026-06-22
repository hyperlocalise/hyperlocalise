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
