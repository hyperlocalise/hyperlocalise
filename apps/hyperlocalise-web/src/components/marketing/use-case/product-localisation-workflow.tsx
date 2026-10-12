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

import * as React from "react";
import Image from "next/image";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CodeIcon,
  GitPullRequestIcon,
  GlobeIcon,
  LightningIcon,
  ShieldCheckIcon,
  TranslateIcon,
  UsersIcon,
  SparkleIcon,
  MagnifyingGlassIcon,
  ChatCircleTextIcon,
  ClockIcon,
} from "@phosphor-icons/react";

import { FormattedMessage } from "react-intl";
import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import type { UseCasePageContent, UseCaseWorkflowStep } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";
import { useEffect, useRef } from "react";
import { useIntl } from "react-intl";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { getIntegrationCatalogEntry } from "@/lib/integrations/integration-catalog";
import { resolveIntegrationBySlug } from "@/lib/integrations/resolve-integration-catalog";

type Props = {
  content: UseCasePageContent;
};

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const meshSources = ["/images/mesh/mesh-gradient-1784864145512.jpg"] as const;

const stepIcons = [
  GitPullRequestIcon,
  BookOpenIcon,
  TranslateIcon,
  UsersIcon,
  SparkleIcon,
  MagnifyingGlassIcon,
  CircleNotchIcon,
  ShieldCheckIcon,
] as const;

function MockRow({
  icon: Icon,
  children,
  selected = false,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className={[
        "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5",
        selected ? "border-pink-500/60 bg-pink-100/70" : "border-border bg-background/80",
      ].join(" ")}
    >
      <Icon
        className={["size-4 shrink-0", selected ? "text-pink-700" : "text-muted-foreground"].join(
          " ",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-[0.7rem] leading-4 text-foreground">{children}</span>
      {selected ? <CheckCircleIcon className="size-4 shrink-0 text-pink-700" aria-hidden /> : null}
    </div>
  );
}

type WorkflowGlassVisualProps = {
  step: UseCaseWorkflowStep;
  expanded: boolean;
};

const sampleLocales = ["FR", "DE", "JA"] as const;

function AIDraftVisual({ step, expanded }: WorkflowGlassVisualProps) {
  return (
    <div className="absolute inset-x-[8%] top-[20%] flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/65 p-4 shadow-lg backdrop-blur-xl sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <TranslateIcon className="size-5 text-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-primary">
          <Message messageKey={step.labelKey} />
        </span>
        <SparkleIcon className="size-5 shrink-0 text-primary" aria-hidden />
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/70 p-3">
        <SparkleIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        {step.descriptionKey ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-primary">
            <Message messageKey={step.descriptionKey} />
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sampleLocales.map((locale) => (
          <span
            key={locale}
            className="rounded-lg border border-border/70 bg-muted/70 px-3 py-1.5 text-xs font-medium text-foreground"
          >
            {locale}
          </span>
        ))}
        <ArrowRightIcon className="ml-auto size-4 text-primary" aria-hidden />
      </div>
      {expanded ? <div className="mt-auto h-1 rounded-full bg-primary/40" /> : null}
    </div>
  );
}

function HumanReviewVisual({ step, expanded }: WorkflowGlassVisualProps) {
  const reviewItems = [
    {
      locale: "FR",
      languageKey: "productLocalisationReviewFrench",
      statusKey: "productLocalisationReviewAssigned",
      Icon: CheckCircleIcon,
    },
    {
      locale: "DE",
      languageKey: "productLocalisationReviewGerman",
      statusKey: "productLocalisationReviewInReview",
      Icon: ChatCircleTextIcon,
    },
    {
      locale: "JA",
      languageKey: "productLocalisationReviewJapanese",
      statusKey: "productLocalisationReviewWaiting",
      Icon: ClockIcon,
    },
  ] as const;

  return (
    <div className="absolute inset-x-[8%] top-[24%] flex flex-col gap-1.5">
      {/* Floating glass header */}
      <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-accent/50 px-3 py-2 shadow-lg backdrop-blur-xl">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background/15">
          <UsersIcon className="size-3.5 text-foreground" aria-hidden />
        </span>

        <span className="min-w-0 flex-1 truncate text-[0.7rem] font-medium text-foreground">
          <Message messageKey={step.labelKey} />
        </span>

        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
      </div>

      {/* Glass review queue */}
      <div className="overflow-hidden rounded-xl border border-border/20 bg-accent/50 px-2 py-1.5 shadow-lg backdrop-blur-xl">
        {reviewItems.map(({ locale, languageKey, statusKey, Icon }, index) => {
          const highlighted = expanded && index === 1;

          return (
            <div
              key={locale}
              className={[
                "flex items-center gap-2 rounded-lg px-1 py-1",
                "transition-colors duration-200",
                highlighted ? "bg-primary/25" : "hover:bg-background/10",
              ].join(" ")}
            >
              {/* Locale */}
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background/15 text-[0.65rem] font-semibold text-foreground">
                {locale}
              </span>

              {/* Language and status */}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[0.7rem] font-medium leading-4 text-foreground">
                  <Message messageKey={languageKey} />
                </span>

                <span className="truncate text-[0.6rem] leading-3 text-foreground/75">
                  <Message messageKey={statusKey} />
                </span>
              </div>

              {/* Status */}
              <span
                className={[
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  highlighted
                    ? "bg-primary/30 text-background"
                    : "bg-background/15 text-foreground",
                ].join(" ")}
              >
                <Icon className="size-3.5" weight={index === 0 ? "fill" : "regular"} aria-hidden />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReleaseCheckVisual({ step, expanded }: WorkflowGlassVisualProps) {
  const checks = [
    { Icon: BookOpenIcon, messageKey: "productLocalisationCapability2Title" as const },
    { Icon: UsersIcon, messageKey: "productLocalisationWorkflowStep3Label" as const },
    { Icon: ShieldCheckIcon, messageKey: "productLocalisationWorkflowStep5Label" as const },
  ];

  return (
    <div className="absolute inset-x-[8%] top-[16%] flex flex-col overflow-hidden rounded-xl bg-accent/50 p-4 py-1.5 shadow-lg backdrop-blur-xl sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          <Message messageKey={step.labelKey} />
        </span>
        <CheckCircleIcon className="size-5 shrink-0 text-primary" weight="fill" aria-hidden />
      </div>
      <div className="mt-4 space-y-2">
        {checks.map(({ Icon, messageKey }) => (
          <div
            key={messageKey}
            className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-muted/60 px-3 py-2.5"
          >
            <Icon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              <Message messageKey={messageKey} />
            </span>
            <CheckCircleIcon className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowPreview({
  index,
  step,
  expanded,
}: {
  index: number;
  step: UseCaseWorkflowStep;
  expanded: boolean;
}) {
  const Icon = stepIcons[index] ?? LightningIcon;

  if (index === 2) return <AIDraftVisual step={step} expanded={expanded} />;
  if (index === 3) return <HumanReviewVisual step={step} expanded={expanded} />;
  if (index === 5) return <ReleaseCheckVisual step={step} expanded={expanded} />;

  return (
    <div className="absolute inset-x-5 top-14 flex flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-[0_12px_32px_rgba(0,0,0,0.13)] py-1.5">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-foreground" aria-hidden />
          </span>

          <span className="truncate text-[0.72rem] font-semibold text-foreground">
            <Message messageKey={step.labelKey} />
          </span>
        </div>

        <span
          className={[
            "size-2 shrink-0 rounded-full",
            expanded ? "bg-pink-500" : "bg-green-600",
          ].join(" ")}
          aria-hidden
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
        {index === 0 ? (
          <>
            <MockRow icon={GitPullRequestIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={CodeIcon}>
              <Message messageKey="productLocalisationWorkflowStep0Description" />
            </MockRow>

            <div className="flex items-center gap-2 px-1 pt-1">
              <span className="size-2 rounded-full bg-green-600" />

              <span className="h-1.5 flex-1 rounded-full bg-green-500/50" />

              <span className="size-2 rounded-full bg-pink-500" />
            </div>
          </>
        ) : null}

        {index === 1 ? (
          <>
            <MockRow icon={BookOpenIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={ShieldCheckIcon}>
              <Message messageKey="productLocalisationCapability2Title" />
            </MockRow>

            <MockRow icon={GlobeIcon}>
              <Message messageKey="productLocalisationWorkflowStep1Description" />
            </MockRow>
          </>
        ) : null}

        {index === 2 ? (
          <>
            <MockRow icon={TranslateIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={LightningIcon}>
              <Message messageKey="productLocalisationWorkflowStep2Description" />
            </MockRow>

            <MockRow icon={ArrowRightIcon}>
              <Message messageKey="productLocalisationWorkflowStep3Label" />
            </MockRow>
          </>
        ) : null}

        {index === 3 ? (
          <>
            <MockRow icon={UsersIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={CheckCircleIcon}>
              <Message messageKey="productLocalisationWorkflowStep3Description" />
            </MockRow>

            <MockRow icon={ArrowRightIcon}>
              <Message messageKey="productLocalisationWorkflowStep4Label" />
            </MockRow>
          </>
        ) : null}

        {index === 4 ? (
          <>
            <MockRow icon={CircleNotchIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={CheckCircleIcon}>
              <Message messageKey="productLocalisationWorkflowStep4Description" />
            </MockRow>

            <div className="flex gap-1.5 px-1 pt-2">
              {[0, 1, 2, 3, 4].map((item) => (
                <span
                  key={item}

                  className={[
                    "h-1.5 flex-1 rounded-full",

                    item < 4 ? "bg-green-600" : "bg-pink-500",
                  ].join(" ")}
                />
              ))}
            </div>
          </>
        ) : null}

        {index === 5 ? (
          <>
            <MockRow icon={ShieldCheckIcon} selected>
              <Message messageKey={step.labelKey} />
            </MockRow>

            <MockRow icon={GlobeIcon}>
              <Message messageKey="productLocalisationWorkflowStep5Description" />
            </MockRow>

            <MockRow icon={CheckCircleIcon}>
              <Message messageKey="productLocalisationWorkflowStep3Label" />
            </MockRow>
          </>
        ) : null}
      </div>

      <div
        className={[
          "overflow-hidden border-t border-border bg-muted/60",
          "transition-[max-height,opacity] duration-300 motion-reduce:transition-none",
          expanded ? "max-h-40 opacity-100" : "max-h-0 border-t-0 opacity-0",
        ].join(" ")}
      >
        {step.descriptionKey ? (
          <p className="px-3 py-3 text-[0.73rem] leading-5 text-foreground">
            <Message messageKey={step.descriptionKey} />
          </p>
        ) : null}
      </div>
    </div>
  );
}

const PRODUCT_CONTEXT_INTEGRATIONS = [
  "github",
  "slack",
  "notion",
  "jira",
  "linear",
  "figma",
  "contentful",
  "crowdin",
  "lokalise",
  "phrase",
] as const;

function ProductContextVisual({
  step,
  expanded,
}: {
  step: UseCaseWorkflowStep;

  expanded: boolean;
}) {
  const locale = useAppLocale();
  const intl = useIntl();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || paused || expanded) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      return;
    }
    let frame = 0;
    let previousTime = 0;

    const animate = (time: number) => {
      if (previousTime) {
        element.scrollTop += ((time - previousTime) / 1000) * 16;

        if (element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
          element.scrollTop = 0;
        }
      }

      previousTime = time;
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [paused, expanded]);

  return (
    <div className="absolute inset-x-[10%] bottom-[-1rem] top-[17%] overflow-hidden rounded-t-xl border border-border bg-background/95 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-[0.8rem] font-semibold text-foreground">
          <Message messageKey={step.labelKey} />
        </p>

        {step.descriptionKey ? (
          <p className="mt-1 line-clamp-2 text-[0.68rem] leading-4 text-muted-foreground">
            <Message messageKey={step.descriptionKey} />
          </p>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="h-[calc(100%-5rem)] space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4"
      >
        {PRODUCT_CONTEXT_INTEGRATIONS.map((slug, index) => {
          const entry = getIntegrationCatalogEntry(slug);
          const resolved = resolveIntegrationBySlug(locale, slug);
          const name = resolved?.name ?? slug;

          return (
            <div
              key={slug}
              className={[
                "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                "bg-background transition-colors",
                expanded && index === 0 ? "border-pink-500 bg-pink-100/60" : "border-border",
              ].join(" ")}
            >
              <IntegrationLogoMark
                iconKey={entry?.iconKey}
                logoSrc={entry?.logoSrc}
                name={name}
                size="sm"
              />

              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {name}
              </span>

              <span
                aria-hidden
                className={[
                  "size-2 shrink-0 rounded-full",
                  expanded && index === 0 ? "bg-pink-500" : "bg-green-600",
                ].join(" ")}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowCard({
  step,
  index,
  selected,
  onSelect,
}: {
  step: UseCaseWorkflowStep;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="group block w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem]">
          <Image
            src={meshSources[index % meshSources.length]}
            alt=""
            aria-hidden
            fill
            unoptimized
            sizes="(min-width: 1280px) 30vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />

          <span className="absolute left-3 top-3 z-10 flex size-8 items-center justify-center rounded-xl bg-black/25 text-sm font-medium text-white backdrop-blur-sm">
            {index + 1}
          </span>
          {index === 1 ? (
            <ProductContextVisual step={step} expanded={selected} />
          ) : (
            <WorkflowPreview index={index} step={step} expanded={selected} />
          )}
        </div>

        <div className="mt-5 space-y-3">
          <TypographyH3 className="text-2xl leading-tight tracking-[-0.03em]">
            <Message messageKey={step.labelKey} />
          </TypographyH3>

          {step.descriptionKey ? (
            <TypographyP className="max-w-md leading-relaxed" size="small" tone="subtle">
              <Message messageKey={step.descriptionKey} />
            </TypographyP>
          ) : null}
        </div>
      </button>
    </article>
  );
}

export function ProductLocalisationWorkflowSection({ content }: Props) {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);

  return (
    <section>
      <div className="mx-auto max-w-3xl text-center">
        <TypographyP className="text-[0.95rem] tracking-[-0.02em]" tone="subtle">
          <Message messageKey={content.workflow.labelKey} />
        </TypographyP>

        <TypographyH2 className="mt-4 text-4xl leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-[3.25rem]">
          <Message messageKey={content.workflow.titleKey} />
        </TypographyH2>

        <TypographyP className="mx-auto mt-6 max-w-2xl" tone="subtle">
          <Message messageKey={content.workflow.descriptionKey} />
        </TypographyP>
      </div>

      <div className="mt-14 grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {content.workflow.steps.map((step, index) => (
          <WorkflowCard
            key={step.labelKey}
            step={step}
            index={index}
            selected={selectedIndex === index}
            onSelect={() => setSelectedIndex((current) => (current === index ? null : index))}
          />
        ))}
      </div>
    </section>
  );
}
