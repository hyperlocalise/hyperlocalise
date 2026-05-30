import { UpgradeWorkspaceFlow } from "@/app/auth/upgrade-workspace/_components/upgrade-workspace-flow";
import { loadUpgradeWorkspaceContext } from "@/lib/workos/upgrade-workspace";

export default async function UpgradeWorkspacePage() {
  const { workspaces } = await loadUpgradeWorkspaceContext();

  return <UpgradeWorkspaceFlow workspaces={workspaces} />;
}
