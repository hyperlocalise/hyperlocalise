import type { IntlShape } from "@formatjs/intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";

type AccessDeniedReason =
  | "workos-membership-lookup-failed"
  | "workspace-archived"
  | "insufficient-permissions"
  | "missing-org-slug"
  | "pending-invite"
  | "callback";

function getAccessDeniedCopy(reason: AccessDeniedReason | undefined, intl: IntlShape) {
  switch (reason) {
    case "workos-membership-lookup-failed":
      return {
        title: intl.formatMessage({
          defaultMessage: "Could not verify membership",
          id: "qdFC9Qh/uN",
          description: "Access denied page title when WorkOS membership lookup fails",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Your account is signed in, but we could not reach WorkOS to confirm your organization membership.",
          id: "7MaLlZw62e",
          description: "Access denied page summary when WorkOS membership lookup fails",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Try again in a moment. If the problem continues, contact support or choose another organization.",
          id: "jhMzSbK5qz",
          description: "Access denied page guidance when WorkOS membership lookup fails",
        }),
      };
    case "workspace-archived":
      return {
        title: intl.formatMessage({
          defaultMessage: "Workspace archived",
          id: "lDEpmcca/9",
          description: "Access denied page title when the workspace is archived",
        }),
        description: intl.formatMessage({
          defaultMessage: "This workspace is archived and can no longer be opened.",
          id: "gr/+9uTU/3",
          description: "Access denied page summary when the workspace is archived",
        }),
        body: intl.formatMessage({
          defaultMessage: "Choose another organization or sign out and retry with another account.",
          id: "qaa1Bmj1zG",
          description: "Access denied page guidance when the workspace is archived",
        }),
      };
    case "insufficient-permissions":
      return {
        title: intl.formatMessage({
          defaultMessage: "Insufficient permissions",
          id: "1H0hH78poY",
          description: "Access denied page title when the user lacks required permissions",
        }),
        description: intl.formatMessage({
          defaultMessage: "Your account does not have permission to open this page.",
          id: "t1gNC2Fo+D",
          description: "Access denied page summary when the user lacks required permissions",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Ask an organization admin to update your role, or choose another organization.",
          id: "RZPckpbVtF",
          description: "Access denied page guidance when the user lacks required permissions",
        }),
      };
    case "missing-org-slug":
      return {
        title: intl.formatMessage({
          defaultMessage: "Workspace unavailable",
          id: "ezrybv9acT",
          description: "Access denied page title when the organization slug is missing",
        }),
        description: intl.formatMessage({
          defaultMessage: "We could not determine which organization to open.",
          id: "gQQcuhRlkz",
          description: "Access denied page summary when the organization slug is missing",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Choose an organization from your account or contact support if this continues.",
          id: "I9aLSBsZbT",
          description: "Access denied page guidance when the organization slug is missing",
        }),
      };
    case "pending-invite":
      return {
        title: intl.formatMessage({
          defaultMessage: "Invitation pending",
          id: "+yMkmaDvaM",
          description:
            "Access denied page title when the user has not finished accepting an invite",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Your account is signed in, but this workspace invitation has not been confirmed yet.",
          id: "Xc6qahwRY8",
          description: "Access denied page summary when the user has a pending workspace invite",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Open the invitation email from your workspace admin and finish accepting the invite, then sign in again. If you already accepted, use Try again to refresh your membership.",
          id: "MikRGST8w6",
          description: "Access denied page guidance when the user has a pending workspace invite",
        }),
      };
    case "callback":
      return {
        title: intl.formatMessage({
          defaultMessage: "Sign-in could not be completed",
          id: "DDsxRVuOKN",
          description: "Access denied page title when the auth callback fails",
        }),
        description: intl.formatMessage({
          defaultMessage: "Something went wrong while finishing sign-in.",
          id: "HHg8t7sqUf",
          description: "Access denied page summary when the auth callback fails",
        }),
        body: intl.formatMessage({
          defaultMessage: "Try signing in again or contact support if this continues.",
          id: "KSyo1/QjAo",
          description: "Access denied page guidance when the auth callback fails",
        }),
      };
    default:
      return {
        title: intl.formatMessage({
          defaultMessage: "Access denied",
          id: "Ra7PJXU8aK",
          description: "Default access denied page title",
        }),
        description: intl.formatMessage({
          defaultMessage:
            "Your account is signed in, but this workspace does not have an active organization context you can use.",
          id: "Yi/8efQvnI",
          description: "Default access denied page summary",
        }),
        body: intl.formatMessage({
          defaultMessage:
            "Ask your organization admin to confirm your WorkOS membership, choose another organization, or sign out and retry with another account.",
          id: "+Ve/t+/sO9",
          description: "Default access denied page guidance",
        }),
      };
  }
}

type AccessDeniedPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const { reason: rawReason } = await searchParams;
  const reason = rawReason as AccessDeniedReason | undefined;
  const locale = await getAppLocale();
  const intl = getIntlShape(locale);
  const copy = getAccessDeniedCopy(reason, intl);

  const chooseOrganizationLabel = intl.formatMessage({
    defaultMessage: "Choose organization",
    id: "fzv0wvOYfZ",
    description: "Button to open organization selection on the access denied page",
  });
  const signOutLabel = intl.formatMessage({
    defaultMessage: "Sign out",
    id: "Y6hwaWFO1N",
    description: "Button to sign out on the access denied page",
  });
  const backToSiteLabel = intl.formatMessage({
    defaultMessage: "Back to site",
    id: "/14v/WK67D",
    description: "Button to return to the marketing site from the access denied page",
  });
  const tryAgainLabel = intl.formatMessage({
    defaultMessage: "Try again",
    id: "sAOynMMuiJ",
    description: "Button to retry sign-in after a pending workspace invite may have been accepted",
  });

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-lg border-border bg-background shadow-2xl shadow-gray-alpha-200">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{copy.title}</CardTitle>
          <CardDescription className="text-muted-foreground">{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TypographyP className="text-sm leading-6 text-muted-foreground">{copy.body}</TypographyP>

          <div className="flex flex-wrap gap-3">
            {reason === "pending-invite" ? (
              <Button nativeButton={false} render={<Link href="/dashboard" />}>
                {tryAgainLabel}
              </Button>
            ) : null}
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/auth/select-organization" />}
            >
              {chooseOrganizationLabel}
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/auth/sign-out?returnTo=/" prefetch={false} />}
            >
              {signOutLabel}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              {backToSiteLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
