import { App, type Octokit } from "octokit";

import { env } from "@/lib/env";

let githubApp: App | null = null;

export function getGitHubApp(): App {
  if (githubApp) {
    return githubApp;
  }
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_WEBHOOK_SECRET) {
    throw new Error("missing GitHub App configuration");
  }

  githubApp = new App({
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
    webhooks: {
      secret: env.GITHUB_APP_WEBHOOK_SECRET,
    },
  });

  return githubApp;
}

export function getInstallationOctokit(installationId: number): Promise<Octokit> {
  return getGitHubApp().getInstallationOctokit(installationId);
}
