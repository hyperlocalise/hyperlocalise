import { createPrivateKey } from "node:crypto";

import { App, type Octokit } from "octokit";

import { env } from "@/lib/env";
import {
  assertGitHubAppPrivateKeyParsable,
  normalizeGitHubAppPrivateKey,
} from "@/lib/agents/github/private-key";

let githubApp: App | null = null;
let cachedPrivateKey: string | null = null;

export function getGitHubAppPrivateKey(): string {
  if (!env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("missing GitHub App private key");
  }

  if (!cachedPrivateKey) {
    const normalized = normalizeGitHubAppPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
    assertGitHubAppPrivateKeyParsable(normalized);
    try {
      createPrivateKey({ key: normalized });
    } catch {
      throw new Error("invalid GitHub App private key PEM format");
    }
    cachedPrivateKey = normalized;
  }

  return cachedPrivateKey;
}

export function getGitHubApp(): App {
  if (githubApp) {
    return githubApp;
  }
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_WEBHOOK_SECRET) {
    throw new Error("missing GitHub App configuration");
  }

  githubApp = new App({
    appId: env.GITHUB_APP_ID,
    privateKey: getGitHubAppPrivateKey(),
    webhooks: {
      secret: env.GITHUB_APP_WEBHOOK_SECRET,
    },
  });

  return githubApp;
}

export function getInstallationOctokit(installationId: number | string): Promise<Octokit> {
  return getGitHubApp().getInstallationOctokit(
    typeof installationId === "number" ? installationId : Number.parseInt(installationId, 10),
  );
}
