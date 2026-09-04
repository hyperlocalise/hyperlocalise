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
import { IntercomConnectionPanel } from "./intercom-connection-panel";
import { SlackIntegrationRow } from "./slack-integration-row";
import {
  resolveWorkspaceIntegrationsBySlugs,
  workspaceComingSoonCollaborationSlugs,
  workspaceComingSoonCustomerEngagementSlugs,
  workspaceComingSoonGuidelineSlugs,
  type WorkspaceIntegrationSummary,
} from "@/lib/integrations/workspace-integrations";

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

function useWorkspaceIntegrations(slugs: readonly string[]) {
  const intl = useIntl();

  return useMemo(() => resolveWorkspaceIntegrationsBySlugs(intl, slugs), [intl, slugs]);
}

export function SourceControlIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  const comingSoonGitLab = useWorkspaceIntegrations(["gitlab"])[0];

  return (
    <>
      <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      {comingSoonGitLab ? <ComingSoonIntegrationRow integration={comingSoonGitLab} isLast /> : null}
    </>
  );
}

export function CollaborationIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  const comingSoonCollaborationAgents = useWorkspaceIntegrations(
    workspaceComingSoonCollaborationSlugs,
  );

  return (
    <>
      <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
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

export function GuidelineIntegrationsSection() {
  const comingSoonGuidelineSources = useWorkspaceIntegrations(workspaceComingSoonGuidelineSlugs);

  return (
    <>
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
  showIntercom = false,
}: {
  organizationSlug: string;
  userIsAdmin: boolean;
  showIntercom?: boolean;
}) {
  const comingSoonCustomerEngagementAgents = useWorkspaceIntegrations(
    workspaceComingSoonCustomerEngagementSlugs,
  );

  return (
    <>
      {showIntercom ? (
        <IntercomConnectionPanel
          organizationSlug={organizationSlug}
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
