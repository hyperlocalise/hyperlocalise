/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { redirect } from "next/navigation";

import { handleGitHubInstallCallback } from "@/lib/agents/github/install-callback";
import { createLogger } from "@/lib/log";

const logger = createLogger("github-install-callback-page");

type GitHubCallbackPageProps = {
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
    code?: string;
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
      hasCode: Boolean(params.code),
    },
    "github install callback page hit",
  );

  const result = await handleGitHubInstallCallback({
    installationId: params.installation_id,
    setupAction: params.setup_action,
    state: params.state,
    code: params.code,
  });

  redirect(result.redirectTo);
}
