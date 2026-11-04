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

import { brandLogomarkSrc } from "@/lib/brand/brand-assets";

import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import { integrationsPageContentMessages } from "./integrations-page-content.messages";
import { BrazeConnectionPanel } from "./braze-connection-panel";
import { CustomerIoConnectionPanel } from "./customer-io-connection-panel";
import { HubspotConnectionPanel } from "./hubspot-connection-panel";
import { IterableConnectionPanel } from "./iterable-connection-panel";
import { LoopsConnectionPanel } from "./loops-connection-panel";
import { MailchimpConnectionPanel } from "./mailchimp-connection-panel";
import { IntercomConnectionPanel } from "./intercom-connection-panel";
import { GoogleDriveConnectionPanel } from "./google-drive-connection-panel";
import { GitLabServerConnectionPanel } from "./gitlab-server-connection-panel";
import { gitlabServerConnectionPanelMessages } from "./gitlab-server-connection-panel.messages";
import { useGitLabServerConnection } from "./use-gitlab-server-connection";
import { PipesConnectionPanel, usePipesStatus } from "./pipes-connection-panel";
import { SlackIntegrationRow } from "./slack-integration-row";
import {
  resolveWorkspaceIntegrationsBySlugs,
  workspaceComingSoonCollaborationSlugs,
  workspaceComingSoonCustomerEngagementSlugs,
  workspaceComingSoonExperimentationSlugs,
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
  name,
  description,
}: {
  organizationSlug: string;
  slugs: readonly PipesProviderSlug[];
  disabled?: boolean;
  isLast?: boolean;
  name?: string;
  description?: string;
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
          name={name}
          description={description}
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
  const intl = useIntl();
  const gitlabServerConnection = useGitLabServerConnection(organizationSlug);
  // Only admins and localization managers can sign in, so the row is theirs. Unknown while
  // loading or after a failed load, so it stays out until the answer is no.
  const workspaceConnected =
    gitlabServerConnection.isSuccess && gitlabServerConnection.data !== null;
  const workspaceUnconnected =
    gitlabServerConnection.isSuccess && gitlabServerConnection.data === null;
  // Once the workspace connects GitLab (GitLab.com included) everything uses that token; the
  // sign-in row then stays only for someone whose own sign-in is stored, so they can remove it.
  const ownSignIn = usePipesStatus(
    organizationSlug,
    "gitlab",
    false,
    userIsAdmin && workspaceConnected,
  );
  const showGitLabComSignIn =
    userIsAdmin &&
    (workspaceUnconnected || (workspaceConnected && ownSignIn.data?.connected === true));

  return (
    <>
      <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <GitLabServerConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
      {showGitLabComSignIn ? (
        <PipesIntegrationList
          organizationSlug={organizationSlug}
          slugs={workspacePipesSourceControlSlugs}
          disabled={!userIsAdmin}
          name={intl.formatMessage(gitlabServerConnectionPanelMessages.gitlabComSignInName)}
          description={intl.formatMessage(
            workspaceConnected
              ? gitlabServerConnectionPanelMessages.gitlabComNotUsed
              : gitlabServerConnectionPanelMessages.gitlabComSignIn,
          )}
        />
      ) : null}
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
      <GoogleDriveConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
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
        <>
          <IntercomConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <BrazeConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <CustomerIoConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <IterableConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <LoopsConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <HubspotConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <MailchimpConnectionPanel organizationSlug={organizationSlug} disabled={!userIsAdmin} />
          <PipesIntegrationList
            organizationSlug={organizationSlug}
            slugs={workspacePipesCustomerEngagementSlugs.filter(
              (slug) =>
                slug !== "intercom" &&
                slug !== "braze" &&
                slug !== "customer-io" &&
                slug !== "iterable" &&
                slug !== "loops" &&
                slug !== "hubspot" &&
                slug !== "mailchimp",
            )}
            disabled={!userIsAdmin}
            isLast={comingSoonCustomerEngagementAgents.length === 0}
          />
        </>
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

export function ExperimentationIntegrationsSection({
  organizationSlug,
}: {
  organizationSlug: string;
}) {
  const intl = useIntl();
  const comingSoonExperimentation = useWorkspaceIntegrations(
    workspaceComingSoonExperimentationSlugs,
  );

  return (
    <>
      <IntegrationRow
        name={intl.formatMessage(integrationsPageContentMessages.hyperlabName)}
        description={intl.formatMessage(integrationsPageContentMessages.hyperlabDetail)}
        icon={<IntegrationLogo src={brandLogomarkSrc} />}
        iconMuted
        action="open"
        href={`/org/${organizationSlug}/hyperlab`}
      />
      {comingSoonExperimentation.map((integration, index) => (
        <ComingSoonIntegrationRow
          key={integration.slug}
          integration={integration}
          isLast={index === comingSoonExperimentation.length - 1}
        />
      ))}
    </>
  );
}
