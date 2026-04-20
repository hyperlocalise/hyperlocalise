import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default async function SelectOrganizationPage() {
  const auth = await requireAppAuthContext();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-2xl border-border/70 bg-background shadow-2xl shadow-foreground/12">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Choose an organization</CardTitle>
          <CardDescription className="text-muted-foreground">
            Select the workspace you want to open. Your organization membership still comes from
            WorkOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
        </CardContent>
      </Card>
    </main>
  );
}
