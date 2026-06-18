"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import type { WorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";

import { createAutomationsApi } from "./automations-api";
import { AutomationsPageView } from "./automations-page-view";

const automationsApi = createAutomationsApi(apiClient);

function automationsQueryKey(organizationSlug: string) {
  return ["workspace-automations", organizationSlug] as const;
}

function renderProductionAutomationLink({
  href,
  children,
  className,
}: Parameters<NonNullable<Parameters<typeof AutomationsPageView>[0]["renderAutomationLink"]>>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function renderProductionActionLink({
  href,
  children,
  kind = "header",
}: Parameters<NonNullable<Parameters<typeof AutomationsPageView>[0]["renderActionLink"]>>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      {...(kind === "template" ? { size: "sm" as const, className: "rounded-full" } : {})}
    >
      {children}
    </Button>
  );
}

export function AutomationsPageContent({
  organizationSlug,
  templates,
  automationsApi: injectedAutomationsApi = automationsApi,
}: {
  organizationSlug: string;
  templates: WorkspaceAutomationTemplate[];
  automationsApi?: typeof automationsApi;
}) {
  const automationsQuery = useQuery({
    queryKey: automationsQueryKey(organizationSlug),
    queryFn: () => injectedAutomationsApi.listAutomations(organizationSlug),
  });

  return (
    <AutomationsPageView
      organizationSlug={organizationSlug}
      automations={automationsQuery.data ?? []}
      templates={templates}
      isLoading={automationsQuery.isLoading}
      error={automationsQuery.error}
      renderAutomationLink={renderProductionAutomationLink}
      renderActionLink={renderProductionActionLink}
    />
  );
}
