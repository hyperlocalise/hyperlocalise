import { and, eq, gt, isNull } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { getGitHubApp } from "@/lib/agents/github/app";
import { isGitHubAppPrivateKeyDecoderError } from "@/lib/agents/github/private-key";
import { getGitHubStateSecret, verifyGitHubState } from "@/lib/agents/github/oauth-state";
import { syncInstallationRepositories } from "@/lib/agents/github/repositories";

const logger = createLogger("github-install-callback");

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GitHubInstallCallbackInput = {
  installationId?: string;
  setupAction?: string;
  state?: string;
  code?: string;
};

export type GitHubInstallCallbackResult = {
  redirectTo: string;
};

function errorCodeFromRedirect(redirectTo: string): string | null {
  try {
    const url = new URL(redirectTo, "http://localhost");
    return url.searchParams.get("error");
  } catch {
    return null;
  }
}

function finish(
  redirectTo: string,
  context: Record<string, unknown>,
  message: string,
): GitHubInstallCallbackResult {
  const error = errorCodeFromRedirect(redirectTo);
  if (error) {
    logger.warn({ ...context, redirectTo, error }, message);
  } else {
    logger.info({ ...context, redirectTo }, message);
  }

  return { redirectTo };
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

function agentErrorRedirect(
  org: { id: string; slug: string | null },
  error: string,
): GitHubInstallCallbackResult {
  const query = new URLSearchParams({ error }).toString();

  if (org.slug) {
    return { redirectTo: `/org/${org.slug}/integrations?${query}` };
  }

  return { redirectTo: `/dashboard?${query}` };
}

async function resolveOrganizationFromState(verified: { slug: string }) {
  let [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, verified.slug))
    .limit(1);

  if (!org && uuidRegex.test(verified.slug)) {
    [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, verified.slug))
      .limit(1);
  }

  return org ?? null;
}

/**
 * Completes a GitHub App installation after GitHub redirects to the app Setup URL
 * with `installation_id` and signed `state`.
 *
 * Authorization is enforced when the install URL is minted (admin-only API route
 * that writes `github_installation_states`). The callback only needs the signed
 * `state` GitHub echoes back plus `installation_id` from GitHub.
 */
export async function handleGitHubInstallCallback(
  input: GitHubInstallCallbackInput,
): Promise<GitHubInstallCallbackResult> {
  const installationId = input.installationId;
  const stateParam = input.state;
  const setupAction = input.setupAction;

  logger.info(
    {
      installationId: installationId ?? null,
      setupAction: setupAction ?? null,
      hasState: Boolean(stateParam),
      hasCode: Boolean(input.code),
      stateLength: stateParam?.length ?? 0,
    },
    "github install callback received",
  );

  if (input.code) {
    return finish(
      "/dashboard?error=github_use_setup_url",
      { hasCode: true },
      "github install callback received user oauth code; setup url required",
    );
  }

  if (!stateParam) {
    return finish(
      "/dashboard?error=missing_callback_params",
      { installationId: installationId ?? null, setupAction: setupAction ?? null },
      "github install callback missing state",
    );
  }

  if (!installationId) {
    if (setupAction === "request") {
      return finish(
        "/dashboard?error=github_install_pending_approval",
        { setupAction },
        "github install pending org approval",
      );
    }

    return finish(
      "/dashboard?error=missing_callback_params",
      { setupAction: setupAction ?? null, hasState: true },
      "github install callback missing installation_id",
    );
  }

  if (!/^\d+$/.test(installationId)) {
    return finish(
      "/dashboard?error=missing_callback_params",
      { installationId, setupAction: setupAction ?? null },
      "github install callback installation_id is not numeric",
    );
  }

  if (!env.GITHUB_APP_ID) {
    return finish(
      "/dashboard?error=github_app_not_configured",
      { installationId },
      "github install callback rejected: app not configured",
    );
  }

  const secret = getGitHubStateSecret();
  const verified = await verifyGitHubState(stateParam, secret);
  if (!verified) {
    return finish(
      "/dashboard?error=invalid_state",
      { installationId },
      "github install callback state verification failed",
    );
  }

  logger.info(
    {
      installationId,
      organizationSlug: verified.slug,
      stateAgeMs: Date.now() - verified.timestamp,
    },
    "github install callback state verified",
  );

  const org = await resolveOrganizationFromState(verified);
  if (!org) {
    return finish(
      "/dashboard?error=organization_not_found",
      { installationId, organizationSlug: verified.slug },
      "github install callback organization not found for state",
    );
  }

  const orgContext = {
    installationId,
    organizationId: org.id,
    organizationSlug: org.slug,
  };

  const now = new Date();
  const consumedStates = await db
    .update(schema.githubInstallationStates)
    .set({ consumedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.githubInstallationStates.nonce, verified.nonce),
        eq(schema.githubInstallationStates.organizationId, org.id),
        gt(schema.githubInstallationStates.expiresAt, now),
        isNull(schema.githubInstallationStates.consumedAt),
      ),
    )
    .returning({ id: schema.githubInstallationStates.id });

  if (consumedStates.length === 0) {
    const redirectTo = agentErrorRedirect(org, "invalid_state").redirectTo;
    return finish(
      redirectTo,
      orgContext,
      "github install callback install state missing, expired, or already consumed",
    );
  }

  logger.info(
    { ...orgContext, installStateId: consumedStates[0]?.id },
    "github install callback install state consumed",
  );

  let accountLogin: string | null = null;
  let accountType: string | null = null;
  try {
    const app = getGitHubApp();
    const { data: installation } = await app.octokit.rest.apps.getInstallation({
      installation_id: Number.parseInt(installationId, 10),
    });
    const account = installation.account as { login?: string; type?: string } | undefined;
    accountLogin = account?.login ?? null;
    accountType = account?.type ?? null;

    logger.info(
      {
        ...orgContext,
        accountLogin,
        accountType,
        repositorySelection: installation.repository_selection ?? null,
        permissions: installation.permissions ?? null,
      },
      "github install callback validated installation with GitHub API",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const privateKeyMisconfigured = isGitHubAppPrivateKeyDecoderError(error);

    logger.error(
      {
        ...orgContext,
        error: errorMessage,
        privateKeyMisconfigured,
      },
      privateKeyMisconfigured
        ? "github install callback getInstallation failed: invalid GITHUB_APP_PRIVATE_KEY"
        : "github install callback getInstallation failed",
    );

    const redirectTo = agentErrorRedirect(
      org,
      privateKeyMisconfigured ? "github_app_private_key_invalid" : "github_installation_invalid",
    ).redirectTo;
    return finish(
      redirectTo,
      orgContext,
      privateKeyMisconfigured
        ? "github install callback rejected: app private key could not be decoded"
        : "github install callback installation invalid",
    );
  }

  const githubInstallationId = installationId;
  const githubAppId = env.GITHUB_APP_ID;

  const [installationLinkedElsewhere] = await db
    .select({ organizationId: schema.githubInstallations.organizationId })
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.githubInstallationId, githubInstallationId))
    .limit(1);

  if (installationLinkedElsewhere && installationLinkedElsewhere.organizationId !== org.id) {
    logger.warn(
      {
        ...orgContext,
        linkedOrganizationId: installationLinkedElsewhere.organizationId,
      },
      "github install callback installation already linked to another organization",
    );

    const redirectTo = agentErrorRedirect(org, "github_installation_already_linked").redirectTo;
    return finish(redirectTo, orgContext, "github install callback installation already linked");
  }

  const existing = await db
    .select()
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.organizationId, org.id))
    .limit(1);

  try {
    if (existing[0]) {
      await db
        .update(schema.githubInstallations)
        .set({
          githubInstallationId,
          githubAppId,
          accountLogin,
          accountType,
          updatedAt: new Date(),
        })
        .where(eq(schema.githubInstallations.id, existing[0].id));

      logger.info(
        { ...orgContext, githubInstallationRowId: existing[0].id, action: "update" },
        "github install callback updated existing installation row",
      );
    } else {
      const [inserted] = await db
        .insert(schema.githubInstallations)
        .values({
          organizationId: org.id,
          githubInstallationId,
          githubAppId,
          accountLogin,
          accountType,
        })
        .returning({ id: schema.githubInstallations.id });

      logger.info(
        { ...orgContext, githubInstallationRowId: inserted?.id, action: "insert" },
        "github install callback inserted installation row",
      );
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      logger.warn(
        { ...orgContext, error: error instanceof Error ? error.message : String(error) },
        "github install callback unique constraint while saving installation",
      );

      const redirectTo = agentErrorRedirect(org, "github_installation_already_linked").redirectTo;
      return finish(redirectTo, orgContext, "github install callback installation already linked");
    }

    logger.error(
      { ...orgContext, error: error instanceof Error ? error.message : String(error) },
      "github install callback failed to persist installation",
    );
    throw error;
  }

  try {
    const repositories = await syncInstallationRepositories({
      organizationId: org.id,
      githubInstallationId,
    });

    logger.info(
      { ...orgContext, syncedRepositoryCount: repositories.length },
      "github install callback repository sync completed",
    );
  } catch (error) {
    logger.warn(
      {
        ...orgContext,
        error: error instanceof Error ? error.message : String(error),
      },
      "github install callback repository sync failed; installation still linked",
    );
  }

  const redirectPath = org.slug
    ? `/org/${org.slug}/integrations?github_connected=1`
    : "/dashboard?github_connected=1";

  return finish(
    redirectPath,
    { ...orgContext, accountLogin, accountType },
    "github install callback completed",
  );
}
