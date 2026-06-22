"use client";

import { MicrosoftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siGitlab, siLinear } from "simple-icons";

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
  name: string;
  description: string;
  icon?: SimpleIcon;
  fallbackIcon?: typeof MicrosoftIcon;
};

const comingSoonCollaborationAgents: readonly ComingSoonAgent[] = [
  {
    name: "Microsoft Teams",
    description: "Coordinate localization reviews from Microsoft Teams workspaces.",
    fallbackIcon: MicrosoftIcon,
  },
  {
    name: "Linear",
    description: "Create issues from translation blockers and keep launch tasks in sync.",
    icon: siLinear,
  },
] as const;

function ComingSoonIntegrationRow({
  name,
  description,
  icon,
  fallbackIcon,
  isLast,
}: {
  name: string;
  description: string;
  icon?: SimpleIcon;
  fallbackIcon?: typeof MicrosoftIcon;
  isLast?: boolean;
}) {
  return (
    <IntegrationRow
      name={name}
      description={description}
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
      <IntegrationCategoryLabel>Source control</IntegrationCategoryLabel>
      <IntegrationCategoryCard>
        <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        <ComingSoonIntegrationRow
          name="GitLab"
          description="Connect GitLab so Hyperlocalise can inspect localized strings, review merge requests, and open localization fixes."
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
      <IntegrationCategoryLabel>Collaboration</IntegrationCategoryLabel>
      <IntegrationCategoryCard>
        <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
        {comingSoonCollaborationAgents.map((agent, index) => (
          <ComingSoonIntegrationRow
            key={agent.name}
            name={agent.name}
            description={agent.description}
            icon={agent.icon}
            fallbackIcon={agent.fallbackIcon}
            isLast={index === comingSoonCollaborationAgents.length - 1}
          />
        ))}
      </IntegrationCategoryCard>
    </section>
  );
}
