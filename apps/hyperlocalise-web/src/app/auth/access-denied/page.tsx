import Link from "next/link";

import { SyncWorkosMembershipAction } from "@/app/auth/access-denied/_components/sync-workos-membership-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TypographyP } from "@/components/ui/typography";

type AccessDeniedReason =
  | "organization-access-denied"
  | "workos-membership-lookup-failed"
  | "workspace-archived"
  | "insufficient-permissions"
  | "missing-org-slug"
  | "callback";

function shouldOfferWorkosMembershipSync(reason: AccessDeniedReason | undefined) {
  return reason === "organization-access-denied" || reason === "workos-membership-lookup-failed";
}

function getAccessDeniedCopy(reason: AccessDeniedReason | undefined) {
  switch (reason) {
    case "organization-access-denied":
      return {
        title: "Organization access unavailable",
        description:
          "Your account is signed in, but we could not match this workspace to an active WorkOS membership.",
        body: "This can happen when a legacy workspace has not finished syncing to WorkOS yet. Try syncing below, choose another organization, or ask an admin to confirm your membership.",
      };
    case "workos-membership-lookup-failed":
      return {
        title: "Could not verify membership",
        description:
          "Your account is signed in, but we could not reach WorkOS to confirm your organization membership.",
        body: "Try syncing again in a moment. If the problem continues, contact support or choose another organization.",
      };
    case "workspace-archived":
      return {
        title: "Workspace archived",
        description: "This workspace is archived and can no longer be opened.",
        body: "Choose another organization or sign out and retry with another account.",
      };
    case "insufficient-permissions":
      return {
        title: "Insufficient permissions",
        description: "Your account does not have permission to open this page.",
        body: "Ask an organization admin to update your role, or choose another organization.",
      };
    case "missing-org-slug":
      return {
        title: "Workspace unavailable",
        description: "We could not determine which organization to open.",
        body: "Choose an organization from your account or contact support if this continues.",
      };
    case "callback":
      return {
        title: "Sign-in could not be completed",
        description: "Something went wrong while finishing sign-in.",
        body: "Try signing in again or contact support if this continues.",
      };
    default:
      return {
        title: "Access denied",
        description:
          "Your account is signed in, but this workspace does not have an active organization context you can use.",
        body: "Ask your organization admin to confirm your WorkOS membership, choose another organization, or sign out and retry with another account.",
      };
  }
}

type AccessDeniedPageProps = {
  searchParams: Promise<{ reason?: string }>;
};

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const { reason: rawReason } = await searchParams;
  const reason = rawReason as AccessDeniedReason | undefined;
  const copy = getAccessDeniedCopy(reason);
  const showWorkosSync = shouldOfferWorkosMembershipSync(reason);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-lg border-border/70 bg-background shadow-2xl shadow-foreground/12">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{copy.title}</CardTitle>
          <CardDescription className="text-muted-foreground">{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TypographyP className="text-sm leading-6 text-muted-foreground">{copy.body}</TypographyP>

          {showWorkosSync ? <SyncWorkosMembershipAction /> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/auth/select-organization" />}
            >
              Choose organization
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/auth/sign-out?returnTo=/" prefetch={false} />}
            >
              Sign out
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              Back to site
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
