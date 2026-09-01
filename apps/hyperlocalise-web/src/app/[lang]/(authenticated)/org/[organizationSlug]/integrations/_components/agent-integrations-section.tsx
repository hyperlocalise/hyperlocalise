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
import type { SimpleIcon } from "simple-icons";
import {
  siGitlab,
  siGoogledrive,
  siHubspot,
  siJira,
  siLinear,
  siLoops,
  siMailchimp,
  siNotion,
  siResend,
} from "simple-icons";
import { useIntl, type MessageDescriptor } from "react-intl";

import { agentIntegrationsSectionMessages } from "./agent-integrations-section.messages";
import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import { IntercomConnectionPanel } from "./intercom-connection-panel";
import { IntegrationLogo } from "./integration-logo";
import { IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { SlackIntegrationRow } from "./slack-integration-row";

type AgentIntegrationsSectionProps = {
  organizationSlug: string;
  userCanManage: boolean;
};

type ComingSoonAgent = {
  nameMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  icon?: SimpleIcon;
  logoSrc?: string;
};

const comingSoonCollaborationAgents: readonly ComingSoonAgent[] = [
  {
    nameMessage: agentIntegrationsSectionMessages.microsoftTeamsName,
    descriptionMessage: agentIntegrationsSectionMessages.microsoftTeamsDescription,
    logoSrc: "/images/microsoft-teams-logo.svg",
  },
  {
    nameMessage: agentIntegrationsSectionMessages.jiraName,
    descriptionMessage: agentIntegrationsSectionMessages.jiraDescription,
    icon: siJira,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.linearName,
    descriptionMessage: agentIntegrationsSectionMessages.linearDescription,
    icon: siLinear,
  },
] as const;

const comingSoonGuidelineSources: readonly ComingSoonAgent[] = [
  {
    nameMessage: agentIntegrationsSectionMessages.googleDriveName,
    descriptionMessage: agentIntegrationsSectionMessages.googleDriveDescription,
    icon: siGoogledrive,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.sharepointName,
    descriptionMessage: agentIntegrationsSectionMessages.sharepointDescription,
    logoSrc: "/images/sharepoint-logo.svg",
  },
  {
    nameMessage: agentIntegrationsSectionMessages.notionName,
    descriptionMessage: agentIntegrationsSectionMessages.notionDescription,
    icon: siNotion,
  },
] as const;

const comingSoonCustomerEngagementAgents: readonly ComingSoonAgent[] = [
  {
    nameMessage: agentIntegrationsSectionMessages.brazeName,
    descriptionMessage: agentIntegrationsSectionMessages.brazeDescription,
    logoSrc: "/images/braze-logo.svg",
  },
  {
    nameMessage: agentIntegrationsSectionMessages.iterableName,
    descriptionMessage: agentIntegrationsSectionMessages.iterableDescription,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.customerIoName,
    descriptionMessage: agentIntegrationsSectionMessages.customerIoDescription,
    logoSrc: "/images/customerio-logo.svg",
  },
  {
    nameMessage: agentIntegrationsSectionMessages.hubspotName,
    descriptionMessage: agentIntegrationsSectionMessages.hubspotDescription,
    icon: siHubspot,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.mailchimpName,
    descriptionMessage: agentIntegrationsSectionMessages.mailchimpDescription,
    icon: siMailchimp,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.loopsName,
    descriptionMessage: agentIntegrationsSectionMessages.loopsDescription,
    icon: siLoops,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.sendgridName,
    descriptionMessage: agentIntegrationsSectionMessages.sendgridDescription,
    logoSrc: "/images/sendgrid-logo.svg",
  },
  {
    nameMessage: agentIntegrationsSectionMessages.resendName,
    descriptionMessage: agentIntegrationsSectionMessages.resendDescription,
    icon: siResend,
  },
] as const;

function ComingSoonIntegrationRow({
  nameMessage,
  descriptionMessage,
  icon,
  logoSrc,
  isLast,
}: {
  nameMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  icon?: SimpleIcon;
  logoSrc?: string;
  isLast?: boolean;
}) {
  const intl = useIntl();

  return (
    <IntegrationRow
      name={intl.formatMessage(nameMessage)}
      description={intl.formatMessage(descriptionMessage)}
      icon={
        logoSrc ? (
          <IntegrationLogo src={logoSrc} />
        ) : icon ? (
          <SimpleBrandIcon icon={icon} colored={false} />
        ) : null
      }
      iconMuted
      action="coming-soon"
      isLast={isLast}
    />
  );
}

export function SourceControlIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  return (
    <>
      <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <ComingSoonIntegrationRow
        nameMessage={agentIntegrationsSectionMessages.gitlabName}
        descriptionMessage={agentIntegrationsSectionMessages.gitlabDescription}
        icon={siGitlab}
        isLast
      />
    </>
  );
}

export function CollaborationIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  return (
    <>
      <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
      {comingSoonCollaborationAgents.map((agent, index) => (
        <ComingSoonIntegrationRow
          key={agent.nameMessage.id}
          nameMessage={agent.nameMessage}
          descriptionMessage={agent.descriptionMessage}
          icon={agent.icon}
          logoSrc={agent.logoSrc}
          isLast={index === comingSoonCollaborationAgents.length - 1}
        />
      ))}
    </>
  );
}

export function GuidelineIntegrationsSection() {
  return (
    <>
      {comingSoonGuidelineSources.map((source, index) => (
        <ComingSoonIntegrationRow
          key={source.nameMessage.id}
          nameMessage={source.nameMessage}
          descriptionMessage={source.descriptionMessage}
          icon={source.icon}
          logoSrc={source.logoSrc}
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
          key={agent.nameMessage.id}
          nameMessage={agent.nameMessage}
          descriptionMessage={agent.descriptionMessage}
          icon={agent.icon}
          logoSrc={agent.logoSrc}
          isLast={index === comingSoonCustomerEngagementAgents.length - 1}
        />
      ))}
    </>
  );
}
