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

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { listPendingInvitations } from "@/lib/workos/pending-invitations";
import { getAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { acceptInvitationAction } from "./actions";

export async function generateMetadata() {
  return getAuthenticatedPageMetadata(await getAppLocale(), "selectOrganization", {
    includeBrandSuffix: true,
  });
}

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitationError?: string }>;
}) {
  const auth = await requireAppAuthContext({ ignoreStoredActiveOrganization: true });
  const intl = getIntlShape(await getAppLocale());
  const [pendingInvitations, { invitationError }] = await Promise.all([
    listPendingInvitations(auth.sessionUser.id),
    searchParams,
  ]);

  const title = intl.formatMessage({
    defaultMessage: "Choose an organization",
    id: "VkNsZOH7xT",
    description: "Page title for selecting which organization workspace to open",
  });
  const description = intl.formatMessage({
    defaultMessage:
      "Select the workspace you want to open. Your organization membership still comes from WorkOS.",
    id: "iaun9okbk5",
    description: "Page description explaining organization selection and WorkOS membership",
  });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-2xl border-border bg-background shadow-2xl shadow-gray-alpha-200">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{title}</CardTitle>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {invitationError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {invitationError === "email_not_verified"
                  ? intl.formatMessage({
                      defaultMessage:
                        "Verify your email address before accepting an invitation, then try again.",
                      id: "aQIYA/it3y",
                      description:
                        "Error on the workspace picker when the person's email address is not verified",
                    })
                  : intl.formatMessage({
                      defaultMessage:
                        "We could not accept that invitation. It may have expired or been withdrawn; ask the workspace admin to invite you again.",
                      id: "yJeeK26KYc",
                      description:
                        "Error on the workspace picker when accepting a workspace invitation fails",
                    })}
              </AlertDescription>
            </Alert>
          ) : null}
          {auth.organizations.map((organization) =>
            organization.slug ? (
              <Button
                key={organization.localOrganizationId}
                variant={
                  organization.localOrganizationId === auth.activeOrganization.localOrganizationId
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
                <form
                  key={invitation.organizationSlug}
                  action={acceptInvitationAction}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <input
                    type="hidden"
                    name="organizationSlug"
                    value={invitation.organizationSlug}
                  />
                  <span className="min-w-0 truncate text-sm">{invitation.organizationName}</span>
                  <Button type="submit" size="sm">
                    {intl.formatMessage({
                      defaultMessage: "Accept",
                      id: "X6NUPESd72",
                      description:
                        "Button on the workspace picker that accepts an invitation and opens that workspace",
                    })}
                  </Button>
                </form>
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
