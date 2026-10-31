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

import {
  ArrowsClockwiseIcon,
  BookOpenIcon,
  CheckCircleIcon,
  FileTextIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const meshSources = [
  "/images/mesh/mesh-gradient-1784864073608.jpg",
  "/images/mesh/mesh-gradient-1788785908604.jpg",
  "/images/mesh/mesh-gradient-1784864042890.jpg",
  "/images/mesh/mesh-gradient-1784864145512.jpg",
] as const;

function MockCard({
  children,
  titleKey,
  subtitleKey,
  icon,
}: {
  children: ReactNode;
  titleKey: UseCaseMessageKey;
  subtitleKey: UseCaseMessageKey;
  icon: ReactNode;
}) {
  return (
    <div className="w-full max-w-[310px] overflow-hidden rounded-2xl border border-border/60 bg-background shadow-[0_16px_32px_rgba(0,0,0,0.07)]">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            <Message messageKey={titleKey} />
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <Message messageKey={subtitleKey} />
          </p>
        </div>
        <span className="shrink-0 text-primary">{icon}</span>
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </div>
  );
}

function MockRow({
  messageKey,
  checked = false,
  muted = false,
}: {
  messageKey: UseCaseMessageKey;
  checked?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <span
        className={`min-w-0 text-[11px] leading-4 ${muted ? "text-muted-foreground" : "text-foreground"}`}
      >
        <Message messageKey={messageKey} />
      </span>
      {checked ? (
        <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
      ) : null}
    </div>
  );
}

function SourceVisual() {
  return (
    <MockCard
      titleKey="helpCenterWorkflowSourceTitle"
      subtitleKey="helpCenterWorkflowSourceSubtitle"
      icon={<FileTextIcon className="size-5" aria-hidden />}
    >
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="text-xs font-medium text-foreground">
          <Message messageKey="helpCenterWorkflowSourceArticle" />
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          <Message messageKey="helpCenterWorkflowSourceArticleMeta" />
        </p>
      </div>
      <MockRow messageKey="helpCenterWorkflowSourceLocaleFr" checked />
      <MockRow messageKey="helpCenterWorkflowSourceLocaleDe" checked />
      <MockRow messageKey="helpCenterWorkflowSourceLocaleJa" checked />
    </MockCard>
  );
}

function AnalysisVisual() {
  return (
    <MockCard
      titleKey="helpCenterWorkflowContextTitle"
      subtitleKey="helpCenterWorkflowContextSubtitle"
      icon={<BookOpenIcon className="size-5" aria-hidden />}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            <Message messageKey="helpCenterWorkflowContextGlossaryLabel" />
          </p>
          <p className="mt-1 text-[11px] font-medium">
            <Message messageKey="helpCenterWorkflowContextGlossaryValue" />
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <p className="text-[10px] text-muted-foreground">
            <Message messageKey="helpCenterWorkflowContextToneLabel" />
          </p>
          <p className="mt-1 text-[11px] font-medium">
            <Message messageKey="helpCenterWorkflowContextToneValue" />
          </p>
        </div>
      </div>
      <p className="px-1 text-[10px] text-muted-foreground">
        <Message messageKey="helpCenterWorkflowContextSourcesLabel" />
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            "helpCenterWorkflowContextSourceZendesk",
            "helpCenterWorkflowContextSourceGlossary",
            "helpCenterWorkflowContextSourcePolicy",
          ] as const
        ).map((key) => (
          <span
            key={key}
            className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[10px]"
          >
            <Message messageKey={key} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-primary/5 p-2.5 text-[11px] text-foreground">
        <CheckCircleIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <Message messageKey="helpCenterWorkflowContextReady" />
      </div>
    </MockCard>
  );
}

function DraftVisual() {
  const [locale, setLocale] = useState<"FR" | "DE" | "JA">("FR");
  return (
    <MockCard
      titleKey="helpCenterWorkflowDraftTitle"
      subtitleKey="helpCenterWorkflowDraftSubtitle"
      icon={<SparkleIcon className="size-5" aria-hidden />}
    >
      <div className="flex gap-1.5">
        {(["FR", "DE", "JA"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
            className={`rounded-md border px-3 py-1.5 text-[10px] font-medium transition-colors ${
              locale === code
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/60 bg-background text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {code}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-[10px] text-muted-foreground">
          <Message messageKey="helpCenterWorkflowDraftOriginalLabel" />
        </p>
        <p className="mt-1 text-[11px] leading-5">
          <Message messageKey="helpCenterWorkflowDraftOriginalText" />
        </p>
      </div>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-primary">
            <Message messageKey="helpCenterWorkflowDraftLocalisedLabel" />
          </p>
          <span className="text-[10px] text-muted-foreground">{locale}</span>
        </div>
        {locale === "FR" ? (
          <p className="mt-1 text-[11px] leading-5">
            <Message messageKey="helpCenterWorkflowDraftLocalisedText" />
          </p>
        ) : (
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            <Message messageKey="helpCenterLocalisationWorkflowStep2Description" />
          </p>
        )}
      </div>
    </MockCard>
  );
}

function TerminologyVisual() {
  const [selected, setSelected] = useState(0);
  const checks = [
    "helpCenterWorkflowQaTerms",
    "helpCenterWorkflowQaLinks",
    "helpCenterWorkflowQaDrift",
  ] as const;
  return (
    <MockCard
      titleKey="helpCenterWorkflowQaTitle"
      subtitleKey="helpCenterWorkflowQaSubtitle"
      icon={<ShieldCheckIcon className="size-5" aria-hidden />}
    >
      <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5 text-[11px] text-muted-foreground">
        <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden />
        <Message messageKey="helpCenterWorkflowQaSearch" />
      </div>
      {checks.map((key, index) => (
        <button
          key={key}
          type="button"
          onClick={() => setSelected(index)}
          aria-pressed={selected === index}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[11px] transition-colors ${
            selected === index
              ? "border-primary/20 bg-primary/5"
              : "border-border/60 bg-background hover:bg-muted/50"
          }`}
        >
          <Message messageKey={key} />
          <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
        </button>
      ))}
      <div className="rounded-lg bg-primary/5 p-2.5 text-[11px] font-medium">
        <Message messageKey="helpCenterWorkflowQaPass" />
      </div>
    </MockCard>
  );
}

function PublishVisual() {
  return (
    <MockCard
      titleKey="helpCenterWorkflowPublishTitle"
      subtitleKey="helpCenterWorkflowPublishSubtitle"
      icon={<ArrowsClockwiseIcon className="size-5" aria-hidden />}
    >
      <MockRow messageKey="helpCenterWorkflowPublishCenter" checked />
      <MockRow messageKey="helpCenterWorkflowPublishWidget" checked />
      <MockRow messageKey="helpCenterWorkflowPublishSearch" checked />
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <GlobeIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <Message messageKey="helpCenterLocalisationWorkflowStep4Description" />
      </div>
    </MockCard>
  );
}

function FreshnessVisual() {
  const [refreshCount, setRefreshCount] = useState(0);
  return (
    <MockCard
      titleKey="helpCenterLocalisationWorkflowStep5Label"
      subtitleKey="helpCenterLocalisationWorkflowStep5Description"
      icon={<ArrowsClockwiseIcon className="size-5" aria-hidden />}
    >
      <MockRow messageKey="helpCenterWorkflowSourceLocaleFr" checked />
      <MockRow messageKey="helpCenterWorkflowSourceLocaleDe" checked />
      <MockRow messageKey="helpCenterWorkflowSourceLocaleJa" checked />
      <button
        type="button"
        onClick={() => setRefreshCount((current) => current + 1)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
      >
        {refreshCount > 0 ? (
          <CheckCircleIcon className="size-4" aria-hidden />
        ) : (
          <ArrowsClockwiseIcon className="size-4" aria-hidden />
        )}
        <Message
          messageKey={
            refreshCount > 0
              ? "helpCenterWorkflowQaPass"
              : "helpCenterLocalisationWorkflowStep5Label"
          }
        />
      </button>
    </MockCard>
  );
}

function WorkflowCard({
  titleKey,
  descriptionKey,
  children,
}: {
  titleKey: UseCaseMessageKey;
  descriptionKey?: UseCaseMessageKey;
  children: ReactNode;
}) {
  const mesh = meshSources[Math.floor(Math.random() * meshSources.length)];
  return (
    <article className="group min-w-0">
      <div
        style={{ backgroundImage: `url(${mesh})` }}
        className="flex h-[330px] items-center justify-center overflow-hidden rounded-[24px] bg-muted p-4 transition-shadow duration-300 group-hover:shadow-[0_14px_36px_rgba(0,0,0,0.06)] bg-cover"
      >
        {children}
      </div>
      <div className="mt-5 px-1">
        <h3 className="text-base font-medium leading-snug tracking-[-0.02em] text-foreground">
          <Message messageKey={titleKey} />
        </h3>
        {descriptionKey ? (
          <TypographyP className="mt-2 text-sm leading-relaxed" tone="subtle">
            <Message messageKey={descriptionKey} />
          </TypographyP>
        ) : null}
      </div>
    </article>
  );
}

const visuals = [
  <SourceVisual key="source" />,
  <AnalysisVisual key="analysis" />,
  <DraftVisual key="draft" />,
  <TerminologyVisual key="terms" />,
  <PublishVisual key="publish" />,
  <FreshnessVisual key="freshness" />,
];

export function HelpCenterLocalisationWorkflowSection({ content }: Props) {
  return (
    <section className="mx-auto w-full max-w-[1280px]">
      <div className="mx-auto max-w-3xl text-center">
        <TypographyP className="text-sm" tone="subtle">
          <Message messageKey={content.workflow.labelKey} />
        </TypographyP>
        <TypographyH2 className="mt-4 text-4xl leading-[1.05] tracking-[-0.05em] sm:text-5xl">
          <Message messageKey={content.workflow.titleKey} />
        </TypographyH2>
        <TypographyP className="mx-auto mt-5 max-w-2xl" tone="subtle">
          <Message messageKey={content.workflow.descriptionKey} />
        </TypographyP>
      </div>
      <div className="mt-14 grid gap-x-4 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {content.workflow.steps.slice(0, 6).map((step, index) => (
          <WorkflowCard
            key={step.labelKey}
            titleKey={step.labelKey}
            descriptionKey={step.descriptionKey}
          >
            {visuals[index]}
          </WorkflowCard>
        ))}
      </div>
    </section>
  );
}
