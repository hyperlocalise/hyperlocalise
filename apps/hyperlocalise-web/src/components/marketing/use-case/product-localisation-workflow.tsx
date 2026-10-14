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
import { useEffect, useRef } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CodeIcon,
  GitPullRequestIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TranslateIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { getIntegrationCatalogEntry } from "@/lib/integrations/integration-catalog";
import { resolveIntegrationBySlug } from "@/lib/integrations/resolve-integration-catalog";
import type { UseCasePageContent, UseCaseWorkflowStep } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const visibleStepIndices = [0, 1, 2, 5] as const;
const meshSources = [
  "/images/mesh/mesh-gradient-1784864073608.jpg",
  "/images/mesh/mesh-gradient-1788785908604.jpg",
  "/images/mesh/mesh-gradient-1784864042890.jpg",
  "/images/mesh/mesh-gradient-1784864145512.jpg",
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
    <div className="absolute inset-x-[8%] top-[24%] flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/65 p-4 shadow-lg backdrop-blur-xl sm:p-5">
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
    </div>
  );
}

function ReleaseCheckVisual({ step }: WorkflowGlassVisualProps) {
  const checks = [
    { Icon: BookOpenIcon, messageKey: "productLocalisationCapability2Title" as const },
    { Icon: UsersIcon, messageKey: "productLocalisationWorkflowStep3Label" as const },
    { Icon: ShieldCheckIcon, messageKey: "productLocalisationWorkflowStep5Label" as const },
  ];

  return (
    <div className="absolute inset-x-[8%] top-[24%] flex flex-col overflow-hidden rounded-xl bg-background p-4 py-1.5 shadow-lg backdrop-blur-xl sm:p-5">
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
            className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-muted px-2 py-2"
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

function GithubPrVisual({ step, expanded }: WorkflowGlassVisualProps) {
  return (
    <div className="absolute inset-x-[7%] top-[24%] overflow-hidden rounded-xl border border-border bg-background shadow-[0_12px_32px_rgba(0,0,0,0.13)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitPullRequestIcon className="size-4 shrink-0 text-foreground" aria-hidden />
          <span className="truncate text-[0.72rem] font-semibold text-foreground">
            <Message messageKey={step.labelKey} />
          </span>
        </div>
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-green-600" />
      </div>
      <div className="space-y-2 p-3">
        <MockRow icon={GitPullRequestIcon} selected={expanded}>
          <Message messageKey={step.labelKey} />
        </MockRow>
        <MockRow icon={CodeIcon}>
          <Message messageKey="productLocalisationWorkflowStep0Description" />
        </MockRow>
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
    <div className="absolute inset-x-[10%] bottom-[-1rem] top-[24%] overflow-hidden rounded-t-xl border border-border bg-background/95 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
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

type Background = "mesh" | "muted";

function WorkflowCard({
  step,
  visualIndex,
  number,
  background,
  meshIndex,
  selected,
  onSelect,
}: {
  step: UseCaseWorkflowStep;
  visualIndex: 0 | 1 | 2 | 5;
  number: number;
  background: Background;
  meshIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const mesh = visualIndex === 0 ? meshSources[0] : meshSources[1];

  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="group block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative aspect-5/6 overflow-hidden rounded-[1rem] bg-[#F4F4F4]">
          {background === "mesh" ? (
            <Image
              src={meshSources[meshIndex % meshSources.length]}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover opacity-50"
              aria-hidden
            />
          ) : (
            <div className="absolute inset-0 bg-muted/45" aria-hidden="true" />
          )}

          <span className="absolute left-3 top-3 z-10 flex size-8 items-center justify-center rounded-xl bg-foreground/15 text-sm font-medium text-foreground backdrop-blur-sm">
            {number}
          </span>

          {visualIndex === 0 ? (
            <GithubPrVisual step={step} expanded={selected} />
          ) : visualIndex === 1 ? (
            <ProductContextVisual step={step} expanded={selected} />
          ) : visualIndex === 2 ? (
            <AIDraftVisual step={step} expanded={selected} />
          ) : (
            <ReleaseCheckVisual step={step} expanded={selected} />
          )}
        </div>

        <div className="mt-5 space-y-2">
          <h3 className="text-base font-medium leading-tight text-foreground">
            <Message messageKey={step.labelKey} />
          </h3>
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

      <div className="mt-14 grid gap-x-4 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
        {visibleStepIndices.map((visualIndex, index) => {
          const step = content.workflow.steps[visualIndex];
          if (!step) return null;

          return (
            <WorkflowCard
              key={step.labelKey}
              step={step}
              visualIndex={visualIndex}
              number={index + 1}
              meshIndex={index}
              background={index === 0 || index === 2 || index === 3 ? "mesh" : "muted"}
              selected={selectedIndex === index}
              onSelect={() => setSelectedIndex((current) => (current === index ? null : index))}
            />
          );
        })}
      </div>
    </section>
  );
}
