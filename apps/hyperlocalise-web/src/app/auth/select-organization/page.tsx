import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntlShape } from "@/lib/app-i18n/intl";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

export default async function SelectOrganizationPage() {
  const auth = await requireAppAuthContext({ ignoreStoredActiveOrganization: true });
  const intl = getIntlShape(await getAppLocale());

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
