import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkosAppAuthState } from "@/lib/workos/auth";
import { sanitizeReturnTo } from "@/lib/workos/return-to";

type OrganizationsPageProps = {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
  }>;
};

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(params.returnTo, "/dashboard");
  const authState = await getWorkosAppAuthState();

  if (authState.kind === "unauthenticated") {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (authState.kind === "access_denied") {
    redirect("/auth/access-denied");
  }

  if (authState.kind === "ready") {
    redirect(returnTo);
  }

  if (authState.organizations.length === 1) {
    redirect(
      `/auth/organizations/activate?organizationId=${encodeURIComponent(
        authState.organizations[0].workosOrganizationId,
      )}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#050505] px-4 py-10 text-white">
      <Card className="w-full max-w-2xl border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className="bg-white text-black">WorkOS</Badge>
            <Badge variant="outline" className="border-white/10 bg-transparent text-white/60">
              Organization selection
            </Badge>
          </div>
          <CardTitle className="font-heading text-3xl">Choose your workspace</CardTitle>
          <CardDescription className="text-white/60">
            Continue into Hyperlocalise with the organization you want to manage in this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              Select an organization to continue.
            </div>
          ) : null}
          <div className="grid gap-3">
            {authState.organizations.map((organization) => (
              <form
                key={organization.workosMembershipId}
                action="/auth/organizations"
                method="post"
              >
                <input
                  type="hidden"
                  name="organizationId"
                  value={organization.workosOrganizationId}
                />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left transition hover:border-white/25 hover:bg-white/[0.06]"
                >
                  <div>
                    <p className="font-medium text-white">{organization.name}</p>
                    <p className="mt-1 text-sm text-white/55">
                      Role: {organization.role}
                      {organization.slug ? ` · ${organization.slug}` : ""}
                    </p>
                  </div>
                  <span className="text-sm text-white/55">Continue</span>
                </button>
              </form>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button render={<Link href="/auth/sign-out?returnTo=/" />}>Sign out</Button>
            <Button variant="outline" render={<Link href="/" />}>
              Back to site
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
