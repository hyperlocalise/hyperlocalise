"use client";

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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import type { WorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";

import { createAutomationsApi } from "./automations-api";
import { AutomationsPageView } from "./automations-page-view";
import { githubAutoReviewCardMessages } from "./github-auto-review-card.messages";

const automationsApi = createAutomationsApi(apiClient);

function automationsQueryKey(organizationSlug: string) {
  return ["workspace-automations", organizationSlug] as const;
}

function githubAutoReviewQueryKey(organizationSlug: string) {
  return ["github-auto-review", organizationSlug] as const;
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
  const intl = useIntl();
  const queryClient = useQueryClient();
  const automationsQuery = useQuery({
    queryKey: automationsQueryKey(organizationSlug),
    queryFn: () => injectedAutomationsApi.listAutomations(organizationSlug),
  });
  const autoReviewQuery = useQuery({
    queryKey: githubAutoReviewQueryKey(organizationSlug),
    queryFn: () => injectedAutomationsApi.getGithubAutoReviewSettings(organizationSlug),
  });
  const saveAutoReview = useMutation({
    mutationFn: (
      input: Parameters<typeof injectedAutomationsApi.updateGithubAutoReviewSettings>[1],
    ) => injectedAutomationsApi.updateGithubAutoReviewSettings(organizationSlug, input),
    onSuccess: (autoReview) => {
      queryClient.setQueryData(githubAutoReviewQueryKey(organizationSlug), autoReview);
      toast.success(intl.formatMessage(githubAutoReviewCardMessages.saveSuccess));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(githubAutoReviewCardMessages.saveError),
      );
    },
  });

  return (
    <AutomationsPageView
      organizationSlug={organizationSlug}
      automations={automationsQuery.data ?? []}
      templates={templates}
      isLoading={automationsQuery.isLoading}
      error={automationsQuery.error}
      autoReview={autoReviewQuery.data}
      autoReviewLoading={autoReviewQuery.isLoading}
      autoReviewError={autoReviewQuery.error}
      autoReviewSaving={saveAutoReview.isPending}
      onSaveAutoReview={async (input) => {
        await saveAutoReview.mutateAsync(input);
      }}
      renderAutomationLink={renderProductionAutomationLink}
      renderActionLink={renderProductionActionLink}
    />
  );
}
