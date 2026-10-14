"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */

import {
  ArrowRightIcon,
  CheckCircleIcon,
  FileTextIcon,
  GlobeIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";
import { IntegrationLogoMark } from "../integrations/integration-logo-mark";

type Props = {
  content: UseCasePageContent;
};

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

function StepHeading({
  titleKey,
  descriptionKey,
}: {
  titleKey: UseCaseMessageKey;
  descriptionKey: UseCaseMessageKey;
}) {
  return (
    <div className="mx-auto max-w-sm px-3 text-center">
      <h3 className="text-lg font-medium text-foreground">
        <Message messageKey={titleKey} />
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        <Message messageKey={descriptionKey} />
      </p>
    </div>
  );
}

function VisualPanel({ children, mesh }: { children: React.ReactNode; mesh: string }) {
  return (
    <div className="relative flex h-[280px] items-center justify-center overflow-hidden rounded-[24px] bg-muted/30 p-5 sm:h-[320px]">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${mesh}")` }}
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 bg-background/25" aria-hidden="true" />

      <div className="relative z-10 flex w-full items-center justify-center">{children}</div>
    </div>
  );
}

function BriefVisual() {
  return (
    <VisualPanel mesh="/images/mesh/mesh-gradient-1788785908604.jpg">
      <div className="w-full max-w-[300px] overflow-hidden rounded-xl border border-border/60 bg-background shadow-[0_14px_35px_rgba(0,0,0,0.09)]">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-lg text-xs font-semibold text-white">
            <IntegrationLogoMark name="Slack" logoSrc="/images/slack-logo.svg" size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">
              <Message messageKey="marketingWorkflowSlackChannel" />
            </p>
            <p className="text-[10px] text-muted-foreground">
              <Message messageKey="marketingWorkflowSlackSubtitle" />
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <MegaphoneIcon className="size-4 text-primary" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                <Message messageKey="marketingWorkflowGrowthLead" />
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <Message messageKey="marketingWorkflowBriefMessage" />
              </p>
            </div>
          </div>

          <div className="ml-10 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <FileTextIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-foreground">
                <Message messageKey="marketingWorkflowBriefFile" />
              </p>
              <p className="text-[10px] text-muted-foreground">
                <Message messageKey="marketingWorkflowBriefFileMeta" />
              </p>
            </div>
          </div>

          <div className="ml-10 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <CheckCircleIcon className="size-3.5 text-primary" aria-hidden />
            <Message messageKey="marketingWorkflowBriefCaptured" />
          </div>
        </div>
      </div>
    </VisualPanel>
  );
}

function LocalisationVisual() {
  const locales = [
    {
      code: "FR",
      key: "marketingWorkflowFrenchDraft" as const,
    },
    {
      code: "DE",
      key: "marketingWorkflowGermanDraft" as const,
    },
    {
      code: "JA",
      key: "marketingWorkflowJapaneseDraft" as const,
    },
  ];

  return (
    <VisualPanel mesh="/images/mesh/mesh-gradient-1784864042890.jpg">
      <div className="w-full max-w-[305px] overflow-hidden rounded-xl border border-border/60 bg-background shadow-[0_14px_35px_rgba(0,0,0,0.09)]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <SparkleIcon className="size-4 text-primary" aria-hidden />
            </span>
            <p className="text-xs font-semibold text-foreground">
              <Message messageKey="marketingWorkflowDraftsHeader" />
            </p>
          </div>
          <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
        </div>

        <div className="space-y-2 p-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2.5">
            <p className="text-[10px] font-medium text-muted-foreground">
              <Message messageKey="marketingWorkflowSourceLabel" />
            </p>
            <p className="mt-1 text-xs font-medium text-foreground">
              <Message messageKey="marketingWorkflowSourceCopy" />
            </p>
          </div>

          {locales.map((locale) => (
            <div
              key={locale.code}
              className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background px-3 py-2.5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium text-foreground">
                {locale.code}
              </span>
              <p className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                <Message messageKey={locale.key} />
              </p>
              <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 border-t border-border/60 px-4 py-3 text-[10px] text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 text-primary" aria-hidden />
          <Message messageKey="marketingWorkflowRulesApplied" />
        </div>
      </div>
    </VisualPanel>
  );
}

function PublishingVisual() {
  const destinations = [
    {
      Icon: ShieldCheckIcon,
      key: "marketingWorkflowLegalApproved" as const,
    },
    {
      Icon: FileTextIcon,
      key: "marketingWorkflowCmsPublished" as const,
    },
    {
      Icon: MegaphoneIcon,
      key: "marketingWorkflowAdsSynced" as const,
    },
  ];

  return (
    <VisualPanel mesh="/images/mesh/mesh-gradient-1784864073608.jpg">
      <div className="w-full max-w-[305px] overflow-hidden rounded-xl border border-border/60 bg-background shadow-[0_14px_35px_rgba(0,0,0,0.09)]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-foreground">
              <Message messageKey="marketingWorkflowPublishingHeader" />
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              <Message messageKey="marketingWorkflowPublishingSubtitle" />
            </p>
          </div>

          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <ArrowRightIcon className="size-4 text-primary" aria-hidden />
          </span>
        </div>

        <div className="space-y-2 p-3">
          {destinations.map(({ Icon, key }) => (
            <div
              key={key}
              className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-3"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 text-[11px] text-foreground">
                <Message messageKey={key} />
              </span>
              <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-primary" aria-hidden />
            <Message messageKey="marketingWorkflowDriftMonitored" />
          </div>
        </div>
      </div>
    </VisualPanel>
  );
}

export function MarketingLocalisationWorkflowSection({ content }: Props) {
  return (
    <section className="w-full">
      <div className="mx-auto max-w-2xl text-center">
        <TypographyP className="mb-4 text-sm" tone="subtle">
          <Message messageKey={content.workflow.labelKey} />
        </TypographyP>

        <TypographyH2
          className="text-3xl leading-tight tracking-[-0.045em] sm:text-4xl lg:text-[2.5rem]"
          wrapStyle="balance"
        >
          <Message messageKey={content.workflow.titleKey} />
        </TypographyH2>

        <TypographyP className="mx-auto mt-4 max-w-xl text-sm leading-relaxed" tone="subtle">
          <Message messageKey={content.workflow.descriptionKey} />
        </TypographyP>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-4">
        <div className="min-w-0 space-y-5">
          <BriefVisual />
          <StepHeading
            titleKey="marketingWorkflowStepBriefTitle"
            descriptionKey="marketingWorkflowStepBriefDescription"
          />
        </div>

        <div className="min-w-0 space-y-5">
          <LocalisationVisual />
          <StepHeading
            titleKey="marketingWorkflowStepLocaliseTitle"
            descriptionKey="marketingWorkflowStepLocaliseDescription"
          />
        </div>

        <div className="min-w-0 space-y-5">
          <PublishingVisual />
          <StepHeading
            titleKey="marketingWorkflowStepPublishTitle"
            descriptionKey="marketingWorkflowStepPublishDescription"
          />
        </div>
      </div>
    </section>
  );
}
