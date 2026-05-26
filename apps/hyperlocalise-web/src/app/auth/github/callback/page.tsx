import { redirect } from "next/navigation";

import { handleGitHubInstallCallback } from "@/lib/agents/github/install-callback";
import { createLogger } from "@/lib/log";

const logger = createLogger("github-install-callback-page");

type GitHubCallbackPageProps = {
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
  }>;
};

export default async function GitHubCallbackPage({ searchParams }: GitHubCallbackPageProps) {
  const params = await searchParams;

  logger.info(
    {
      transport: "page",
      installationId: params.installation_id ?? null,
      setupAction: params.setup_action ?? null,
      hasState: Boolean(params.state),
    },
    "github install callback page hit",
  );

  const result = await handleGitHubInstallCallback({
    installationId: params.installation_id,
    setupAction: params.setup_action,
    state: params.state,
  });

  redirect(result.redirectTo);
}
