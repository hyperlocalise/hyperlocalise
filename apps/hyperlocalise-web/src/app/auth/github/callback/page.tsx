import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

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

  const githubInstallationId = Number.parseInt(installationId, 10);
  const githubAppId = Number.parseInt(env.GITHUB_APP_ID ?? "0", 10);

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
