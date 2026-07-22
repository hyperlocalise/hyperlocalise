import type { AuthVariables } from "@/api/auth/workos";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";

export async function resolveChatKnowledgeMemoryCapability(auth: AuthVariables["auth"]) {
  try {
    return (
      (await workspaceKnowledgeFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}
