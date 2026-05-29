"use client";

import {
  GoogleIcon,
  MicrosoftIcon,
  TelegramIcon,
  WhatsappIcon,
  WorkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import {
  IntegrationCategoryCard,
  IntegrationCategoryLabel,
  IntegrationRow,
} from "./integration-row";
import { SlackIntegrationRow } from "./slack-integration-row";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

type AgentIntegrationsSectionProps = {
  organizationSlug: string;
  userCanManage: boolean;
};

const comingSoonCollaborationAgents = [
  {
    name: "Microsoft Teams",
    description: "Work with Cloud Agents from Microsoft Teams workspaces.",
    icon: MicrosoftIcon,
  },
  {
    name: "Linear",
    description: "Create issues from translation blockers and keep launch tasks in sync.",
    icon: WorkIcon,
  },
  {
    name: "Google Chat",
    description: "Send review prompts and translation status to Google Chat spaces.",
    icon: GoogleIcon,
  },
  {
    name: "Telegram",
    description: "Receive lightweight release alerts and approve routine agent actions.",
    icon: TelegramIcon,
  },
  {
    name: "WhatsApp",
    description: "Coordinate urgent localization approvals with WhatsApp notifications.",
    icon: WhatsappIcon,
  },
] as const;

function ComingSoonIntegrationRow({
  name,
  description,
  icon,
  isLast,
}: {
  name: string;
  description: string;
  icon: (typeof comingSoonCollaborationAgents)[number]["icon"];
  isLast?: boolean;
}) {
  return (
    <IntegrationRow
      name={name}
      description={description}
      icon={<HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-5" />}
      action="coming-soon"
      isLast={isLast}
    />
  );
}

export function AgentIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <IntegrationCategoryLabel>Source control</IntegrationCategoryLabel>
          <TypographyH2 className="mt-2 font-heading text-xl font-medium text-foreground md:text-xl">
            Source control
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect repositories so agents can review pull requests, open localization fixes, and
            use codebase context.
          </TypographyP>
        </div>
        <IntegrationCategoryCard>
          <GitHubIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
          <ComingSoonIntegrationRow
            name="GitLab"
            description="Connect GitLab for Cloud Agents, Bugbot, and enhanced codebase context."
            icon={WorkIcon}
            isLast
          />
        </IntegrationCategoryCard>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <IntegrationCategoryLabel>Collaboration</IntegrationCategoryLabel>
          <TypographyH2 className="mt-2 font-heading text-xl font-medium text-foreground md:text-xl">
            Collaboration
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect the channels your team already uses so Hyperlocalise agents can respond in
            Slack, email, and more.
          </TypographyP>
        </div>
        <IntegrationCategoryCard>
          <SlackIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
          <EmailIntegrationRow organizationSlug={organizationSlug} userCanManage={userCanManage} />
          {comingSoonCollaborationAgents.map((agent, index) => (
            <ComingSoonIntegrationRow
              key={agent.name}
              name={agent.name}
              description={agent.description}
              icon={agent.icon}
              isLast={index === comingSoonCollaborationAgents.length - 1}
            />
          ))}
        </IntegrationCategoryCard>
      </section>
    </>
  );
}
