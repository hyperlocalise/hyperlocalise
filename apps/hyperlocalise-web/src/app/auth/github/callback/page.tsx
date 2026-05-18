import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";

import { isAdminRole } from "@/api/auth/roles";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { getGitHubApp } from "@/lib/agents/github/app";
import { getGitHubStateSecret, verifyGitHubState } from "@/lib/agents/github/oauth-state";
import { syncInstallationRepositories } from "@/lib/agents/github/repositories";

type GitHubCallbackPageProps = {
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
  }>;
};

export default async function GitHubCallbackPage({ searchParams }: GitHubCallbackPageProps) {
  const params = await searchParams;
  const installationId = params.installation_id;
  const stateParam = params.state;

  if (!installationId || !stateParam) {
    redirect("/dashboard?error=missing_callback_params");
  }

  if (!/^\d+$/.test(installationId)) {
    redirect("/dashboard?error=missing_callback_params");
  }

  if (!env.GITHUB_APP_ID) {
    redirect("/dashboard?error=github_app_not_configured");
  }

  const secret = getGitHubStateSecret();
  const verified = await verifyGitHubState(stateParam, secret);
  if (!verified) {
    redirect("/dashboard?error=invalid_state");
  }

  const orgs = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, verified.slug))
    .limit(1);

  const org = orgs[0];
  if (!org) {
    redirect("/dashboard?error=organization_not_found");
  }

  const auth = await resolveApiAuthContextFromSession({ organizationSlug: verified.slug });
  if (!auth || auth.organization.localOrganizationId !== org.id) {
    redirect("/dashboard?error=unauthorized");
  }

  if (!isAdminRole(auth.membership.role)) {
    redirect("/dashboard?error=forbidden");
  }

  const now = new Date();
  const consumedStates = await db
    .update(schema.githubInstallationStates)
    .set({ consumedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.githubInstallationStates.nonce, verified.nonce),
        eq(schema.githubInstallationStates.organizationId, org.id),
        eq(schema.githubInstallationStates.userId, auth.user.localUserId),
        gt(schema.githubInstallationStates.expiresAt, now),
        isNull(schema.githubInstallationStates.consumedAt),
      ),
    )
    .returning({ id: schema.githubInstallationStates.id });

  if (consumedStates.length === 0) {
    redirect("/dashboard?error=invalid_state");
  }

  let accountLogin: string | null = null;
  let accountType: string | null = null;
  try {
    const app = getGitHubApp();
    const { data: installation } = await app.octokit.rest.apps.getInstallation({
      installation_id: Number.parseInt(installationId, 10),
    });
    // TODO: narrow account union properly when octokit types are updated.
    const account = installation.account as { login?: string; type?: string } | undefined;
    accountLogin = account?.login ?? null;
    accountType = account?.type ?? null;
  } catch {
    // Ignore errors fetching details; we can still store the basic record.
  }

  const githubInstallationId = installationId;
  const githubAppId = env.GITHUB_APP_ID;

  const existing = await db
    .select()
    .from(schema.githubInstallations)
    .where(eq(schema.githubInstallations.organizationId, org.id))
    .limit(1);

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
  } else {
    await db.insert(schema.githubInstallations).values({
      organizationId: org.id,
      githubInstallationId,
      githubAppId,
      accountLogin,
      accountType,
    });
  }

  try {
    await syncInstallationRepositories({
      organizationId: org.id,
      githubInstallationId,
    });
  } catch {
    // The installation is still valid if repository sync temporarily fails.
    // Admins can refresh repositories from the GitHub agent settings card.
  }

  redirect(`/org/${verified.slug}/settings?github_connected=1`);
}
