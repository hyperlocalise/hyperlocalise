import type { ApiAuthContext } from "@/api/auth/workos";

export type WorkspaceKnowledgeFlagResolver = (auth: ApiAuthContext) => Promise<boolean>;

export async function resolveWorkspaceKnowledgeEnabled(
  resolver: WorkspaceKnowledgeFlagResolver | undefined,
  auth: ApiAuthContext,
) {
  if (!resolver) {
    return false;
  }

  try {
    return await resolver(auth);
  } catch {
    return false;
  }
}
