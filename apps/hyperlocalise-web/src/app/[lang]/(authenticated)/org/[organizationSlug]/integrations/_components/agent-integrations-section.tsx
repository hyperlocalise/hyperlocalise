"use client";

import { MicrosoftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siGitlab, siLinear } from "simple-icons";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { agentIntegrationsSectionMessages } from "./agent-integrations-section.messages";
import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import {
  IntegrationCategoryCard,
  IntegrationCategoryLabel,
  IntegrationRow,
} from "./integration-row";
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
  fallbackIcon?: typeof MicrosoftIcon;
};

const comingSoonCollaborationAgents: readonly ComingSoonAgent[] = [
  {
    nameMessage: agentIntegrationsSectionMessages.microsoftTeamsName,
    descriptionMessage: agentIntegrationsSectionMessages.microsoftTeamsDescription,
    fallbackIcon: MicrosoftIcon,
  },
  {
    nameMessage: agentIntegrationsSectionMessages.linearName,
    descriptionMessage: agentIntegrationsSectionMessages.linearDescription,
    icon: siLinear,
  },
] as const;

function ComingSoonIntegrationRow({
  nameMessage,
  descriptionMessage,
  icon,
  fallbackIcon,
  isLast,
}: {
  nameMessage: MessageDescriptor;
  descriptionMessage: MessageDescriptor;
  icon?: SimpleIcon;
  fallbackIcon?: typeof MicrosoftIcon;
  isLast?: boolean;
}) {
  const intl = useIntl();

  return (
    <IntegrationRow
      name={intl.formatMessage(nameMessage)}
      description={intl.formatMessage(descriptionMessage)}
      icon={
        icon ? (
          <SimpleBrandIcon icon={icon} colored={false} />
        ) : fallbackIcon ? (
          <HugeiconsIcon icon={fallbackIcon} strokeWidth={1.8} className="size-5" />
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
    <section className="flex flex-col gap-3">
      <IntegrationCategoryLabel>
        <FormattedMessage {...agentIntegrationsSectionMessages.sourceControlCategory} />
      </IntegrationCategoryLabel>
      <IntegrationCategoryCard>
        <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        <ComingSoonIntegrationRow
          nameMessage={agentIntegrationsSectionMessages.gitlabName}
          descriptionMessage={agentIntegrationsSectionMessages.gitlabDescription}
          icon={siGitlab}
          isLast
        />
      </IntegrationCategoryCard>
    </section>
  );
}

export function CollaborationIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <IntegrationCategoryLabel>
        <FormattedMessage {...agentIntegrationsSectionMessages.collaborationCategory} />
      </IntegrationCategoryLabel>
      <IntegrationCategoryCard>
        <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        {comingSoonCollaborationAgents.map((agent, index) => (
          <ComingSoonIntegrationRow
            key={index}
            nameMessage={agent.nameMessage}
            descriptionMessage={agent.descriptionMessage}
            icon={agent.icon}
            fallbackIcon={agent.fallbackIcon}
            isLast={index === comingSoonCollaborationAgents.length - 1}
          />
        ))}
      </IntegrationCategoryCard>
    </section>
  );
}
