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
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import { GitLabSelfHostedPanel } from "./gitlab-self-hosted-panel";
import { PipesConnectionPanel } from "./pipes-connection-panel";
import { SlackIntegrationRow } from "./slack-integration-row";
import {
  resolveWorkspaceIntegrationsBySlugs,
  workspaceComingSoonCollaborationSlugs,
  workspaceComingSoonCustomerEngagementSlugs,
  workspaceComingSoonGuidelineSlugs,
  workspacePipesCollaborationSlugs,
  workspacePipesCustomerEngagementSlugs,
  workspacePipesGuidelineSlugs,
  workspacePipesSourceControlSlugs,
  type WorkspaceIntegrationSummary,
} from "@/lib/integrations/workspace-integrations";
import type { PipesProviderSlug } from "@/lib/pipes/providers";

type AgentIntegrationsSectionProps = {
  organizationSlug: string;
  userCanManage: boolean;
};

function ComingSoonIntegrationRow({
  integration,
  isLast,
}: {
  integration: WorkspaceIntegrationSummary;
  isLast?: boolean;
}) {
  return (
    <IntegrationRow
      name={integration.name}
      description={integration.detail}
      icon={
        integration.logoSrc ? (
          <IntegrationLogo src={integration.logoSrc} />
        ) : integration.icon ? (
          <SimpleBrandIcon icon={integration.icon} colored={false} />
        ) : null
      }
      iconMuted
      action="coming-soon"
      isLast={isLast}
    />
  );
}

function PipesIntegrationList({
  organizationSlug,
  slugs,
  disabled,
  isLast,
}: {
  organizationSlug: string;
  slugs: readonly PipesProviderSlug[];
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <>
      {slugs.map((slug, index) => (
        <PipesConnectionPanel
          key={slug}
          organizationSlug={organizationSlug}
          provider={slug}
          disabled={disabled}
          isLast={Boolean(isLast) && index === slugs.length - 1}
        />
      ))}
    </>
  );
}

function useWorkspaceIntegrations(slugs: readonly string[]) {
  const intl = useIntl();

  return useMemo(() => resolveWorkspaceIntegrationsBySlugs(intl, slugs), [intl, slugs]);
}

export function SourceControlIntegrationsSection({
  organizationSlug,
  userCanManage,
  userIsAdmin,
}: AgentIntegrationsSectionProps & { userIsAdmin: boolean }) {
  return (
    <>
      <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <PipesIntegrationList
        organizationSlug={organizationSlug}
        slugs={workspacePipesSourceControlSlugs}
        disabled={!userIsAdmin}
      />
      <GitLabSelfHostedPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} isLast />
    </>
  );
}

export function CollaborationIntegrationsSection({
  organizationSlug,
  userCanManage,
  userIsAdmin,
}: AgentIntegrationsSectionProps & { userIsAdmin: boolean }) {
  const comingSoonCollaborationAgents = useWorkspaceIntegrations(
    workspaceComingSoonCollaborationSlugs,
  );

  return (
    <>
      <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <PipesIntegrationList
        organizationSlug={organizationSlug}
        slugs={workspacePipesCollaborationSlugs}
        disabled={!userIsAdmin}
      />
      {comingSoonCollaborationAgents.map((agent, index) => (
        <ComingSoonIntegrationRow
          key={agent.slug}
          integration={agent}
          isLast={index === comingSoonCollaborationAgents.length - 1}
        />
      ))}
    </>
  );
}

export function GuidelineIntegrationsSection({
  organizationSlug,
  userIsAdmin,
}: {
  organizationSlug: string;
  userIsAdmin: boolean;
}) {
  const comingSoonGuidelineSources = useWorkspaceIntegrations(workspaceComingSoonGuidelineSlugs);

  return (
    <>
      <PipesIntegrationList
        organizationSlug={organizationSlug}
        slugs={workspacePipesGuidelineSlugs}
        disabled={!userIsAdmin}
      />
      {comingSoonGuidelineSources.map((source, index) => (
        <ComingSoonIntegrationRow
          key={source.slug}
          integration={source}
          isLast={index === comingSoonGuidelineSources.length - 1}
        />
      ))}
    </>
  );
}

export function CustomerEngagementIntegrationsSection({
  organizationSlug,
  userIsAdmin,
  showPipes = false,
}: {
  organizationSlug: string;
  userIsAdmin: boolean;
  showPipes?: boolean;
}) {
  const comingSoonCustomerEngagementAgents = useWorkspaceIntegrations(
    workspaceComingSoonCustomerEngagementSlugs,
  );

  return (
    <>
      {showPipes ? (
        <PipesIntegrationList
          organizationSlug={organizationSlug}
          slugs={workspacePipesCustomerEngagementSlugs}
          disabled={!userIsAdmin}
          isLast={comingSoonCustomerEngagementAgents.length === 0}
        />
      ) : null}
      {comingSoonCustomerEngagementAgents.map((agent, index) => (
        <ComingSoonIntegrationRow
          key={agent.slug}
          integration={agent}
          isLast={index === comingSoonCustomerEngagementAgents.length - 1}
        />
      ))}
    </>
  );
}
