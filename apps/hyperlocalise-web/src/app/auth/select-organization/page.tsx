/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { getAppAuthContextAllowingNoWorkspace } from "@/lib/workos/app-auth";
import { listPendingInvitations } from "@/lib/workos/pending-invitations";
import { getAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { AcceptInvitationForm } from "./_components/accept-invitation-form";

export async function generateMetadata() {
  return getAuthenticatedPageMetadata(await getAppLocale(), "selectOrganization", {
    includeBrandSuffix: true,
  });
}

export default async function SelectOrganizationPage() {
  // Someone with no workspace yet sees their invitations and Create workspace here.
  const { auth, sessionUser } = await getAppAuthContextAllowingNoWorkspace({
    ignoreStoredActiveOrganization: true,
  });
  const intl = getIntlShape(await getAppLocale());
  // Invitations go to an email address, so only a verified address may see them.
  const pendingInvitations = sessionUser.emailVerified
    ? await listPendingInvitations(sessionUser.id)
    : [];

  const title = intl.formatMessage({
    defaultMessage: "Choose a workspace",
    id: "3xa+IqbvLl",
    description: "Page title for selecting which workspace to open",
  });
  const description = intl.formatMessage({
    defaultMessage: "Open one of your workspaces, accept an invitation, or create a new workspace.",
    id: "UK7jOz9fV2",
    description: "Page description on the workspace picker",
  });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-2xl border-border bg-background shadow-2xl shadow-gray-alpha-200">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{title}</CardTitle>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(auth?.organizations ?? []).map((organization) =>
            organization.slug ? (
              <Button
                key={organization.localOrganizationId}
                variant={
                  organization.localOrganizationId === auth?.activeOrganization.localOrganizationId
                    ? "default"
                    : "outline"
                }
                nativeButton={false}
                className="justify-start"
                render={
                  <Link
                    href={`/auth/select-organization/${organization.slug}?returnTo=/dashboard`}
                  />
                }
              >
                {organization.name}
              </Button>
            ) : null,
          )}
          {pendingInvitations.length > 0 ? (
            <section className="flex flex-col gap-2 pt-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {intl.formatMessage({
                  defaultMessage: "Invitations",
                  id: "klDfkrFdL9",
                  description:
                    "Heading above the workspaces the person has been invited to on the workspace picker",
                })}
              </h2>
              {pendingInvitations.map((invitation) => (
                <AcceptInvitationForm
                  key={invitation.organizationSlug}
                  organizationName={invitation.organizationName}
                  organizationSlug={invitation.organizationSlug}
                />
              ))}
            </section>
          ) : null}
          <Button
            variant="ghost"
            nativeButton={false}
            className="justify-start"
            render={<Link href="/auth/new-workspace" />}
          >
            {intl.formatMessage({
              defaultMessage: "Create workspace",
              id: "lQxXTbs2H9",
              description:
                "Link on the workspace picker to the page for creating another workspace",
            })}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
