"use client";

import { MicrosoftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SimpleIcon } from "simple-icons";
import { siGitlab, siGooglechat, siLinear, siTelegram, siWhatsapp } from "simple-icons";

import { EmailIntegrationRow } from "./email-integration-row";
import { GitHubIntegrationRow } from "./github-integration-row";
import { IntegrationCategoryCard, IntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { SlackIntegrationRow } from "./slack-integration-row";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

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
  {
    name: "Google Chat",
    description: "Send review prompts and translation status to Google Chat spaces.",
    icon: siGooglechat,
  },
  {
    name: "Telegram",
    description: "Receive lightweight release alerts and approve routine agent actions.",
    icon: siTelegram,
  },
  {
    name: "WhatsApp",
    description: "Coordinate urgent localization approvals with WhatsApp notifications.",
    icon: siWhatsapp,
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

export function AgentIntegrationsSection({
  organizationSlug,
  userCanManage,
}: AgentIntegrationsSectionProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <div>
          <TypographyH2 className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
            Source control
          </TypographyH2>
          <TypographyP className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Connect repositories so Hyperlocalise can inspect localized strings, review pull
            requests, and open localization fixes.
          </TypographyP>
        </div>
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

      <section className="flex flex-col gap-3">
        <div>
          <TypographyH2 className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
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
              fallbackIcon={agent.fallbackIcon}
              isLast={index === comingSoonCollaborationAgents.length - 1}
            />
          ))}
        </IntegrationCategoryCard>
      </section>
    </>
  );
}
