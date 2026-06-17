"use client";

import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { env } from "@/lib/env";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

function UseCaseMessage({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

function formatStepLabel(index: number, offset = 0) {
  return `0${index + 1 + offset}`;
}

type UseCaseHeroProps = {
  content: UseCasePageContent;
};

export function UseCaseHero({ content }: UseCaseHeroProps) {
  return (
    <section className="pt-16 lg:pt-20">
      <div className="max-w-3xl space-y-8">
        <p className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
          <UseCaseMessage messageKey={content.hero.eyebrowKey} />
        </p>
        <TypographyH1 className="text-left text-balance">
          <UseCaseMessage messageKey={content.hero.headlineKey} />
        </TypographyH1>
        <TypographyP className="max-w-2xl text-muted-foreground">
          <UseCaseMessage messageKey={content.hero.subheadlineKey} />
        </TypographyP>
        <Button
          nativeButton={false}
          render={
            <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <UseCaseMessage messageKey={content.hero.ctaLabelKey} />
        </Button>
      </div>

      <div className="mt-12 overflow-hidden rounded-[1.5rem] border border-foreground/10 bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
        <div className="grid divide-y divide-foreground/10 lg:grid-cols-[1.05fr_1.7fr] lg:divide-x lg:divide-y-0">
          <div className="px-6 py-7 sm:px-8 sm:py-9">
            <TypographyP className="text-[0.95rem] tracking-[-0.02em] text-foreground/40">
              <UseCaseMessage messageKey="problemPanelEyebrow" />
            </TypographyP>
            <TypographyH2 className="mt-8 max-w-xl text-3xl leading-[1.04] tracking-[-0.045em] sm:text-4xl">
              <UseCaseMessage messageKey={content.problem.titleKey} />
            </TypographyH2>
          </div>
          <div className="grid divide-y divide-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {content.problem.painKeys.slice(0, 3).map((painKey, index) => (
              <article key={painKey} className="flex flex-col gap-8 px-6 py-7 sm:px-7 sm:py-8">
                <TypographyP className="text-[0.95rem] tracking-[-0.02em] text-foreground/40">
                  {formatStepLabel(index)}
                </TypographyP>
                <TypographyP className="text-sm leading-relaxed text-foreground/55">
                  <UseCaseMessage messageKey={painKey} />
                </TypographyP>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type UseCaseOverviewSectionProps = {
  content: UseCasePageContent;
};

export function UseCaseOverviewSection({ content }: UseCaseOverviewSectionProps) {
  return (
    <section>
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.4fr] lg:items-start">
        <div className="max-w-2xl space-y-5">
          <div className="text-sm text-muted-foreground/60">
            <UseCaseMessage messageKey="overviewSectionLabel" />
          </div>
          <TypographyH2 className="text-4xl sm:text-5xl">
            <UseCaseMessage messageKey={content.problem.descriptionKey} />
          </TypographyH2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {content.capabilities.items.slice(0, 4).map((item, index) => (
            <article key={item.titleKey} className="border-t border-border/70 pt-5">
              <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground/60 uppercase">
                {formatStepLabel(index)}
              </div>
              <TypographyH3 className="mt-3 text-xl font-medium tracking-[-0.03em]">
                <UseCaseMessage messageKey={item.titleKey} />
              </TypographyH3>
              <TypographyP className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <UseCaseMessage messageKey={item.descriptionKey} />
              </TypographyP>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type UseCaseWorkflowSectionProps = {
  content: UseCasePageContent["workflow"];
};

export function UseCaseWorkflowSection({ content }: UseCaseWorkflowSectionProps) {
  return (
    <section>
      <div className="max-w-2xl space-y-5">
        <div className="text-sm text-muted-foreground/60">
          <UseCaseMessage messageKey={content.labelKey} />
        </div>
        <TypographyH2 className="text-4xl sm:text-5xl">
          <UseCaseMessage messageKey={content.titleKey} />
        </TypographyH2>
        <TypographyP className="text-muted-foreground">
          <UseCaseMessage messageKey={content.descriptionKey} />
        </TypographyP>
      </div>

      <div className="mt-12 overflow-hidden rounded-[1.5rem] border border-foreground/10 bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
        <div className="grid divide-y divide-foreground/10 sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {content.steps.map((step, index) => (
            <article key={step.labelKey} className="flex flex-col gap-3 px-6 py-7 sm:px-7 sm:py-8">
              <TypographyP className="text-[0.95rem] tracking-[-0.02em] text-foreground/40">
                {formatStepLabel(index)}
              </TypographyP>
              <TypographyH3 className="text-xl font-medium tracking-[-0.03em] text-foreground">
                <UseCaseMessage messageKey={step.labelKey} />
              </TypographyH3>
              {step.descriptionKey ? (
                <TypographyP className="text-sm leading-relaxed text-foreground/50">
                  <UseCaseMessage messageKey={step.descriptionKey} />
                </TypographyP>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type UseCaseCapabilitiesSectionProps = {
  content: UseCasePageContent["capabilities"];
};

export function UseCaseCapabilitiesSection({ content }: UseCaseCapabilitiesSectionProps) {
  return (
    <section>
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.6fr]">
        <div className="max-w-2xl space-y-5">
          <div className="text-sm text-muted-foreground/60">
            <UseCaseMessage messageKey={content.labelKey} />
          </div>
          <TypographyH2 className="text-4xl sm:text-5xl">
            <UseCaseMessage messageKey={content.titleKey} />
          </TypographyH2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {content.items.slice(4).map((item, index) => (
            <article key={item.titleKey} className="border-t border-border/70 pt-5">
              <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground/60 uppercase">
                {formatStepLabel(index, 4)}
              </div>
              <TypographyH3 className="mt-3 text-xl font-medium tracking-[-0.03em]">
                <UseCaseMessage messageKey={item.titleKey} />
              </TypographyH3>
              <TypographyP className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <UseCaseMessage messageKey={item.descriptionKey} />
              </TypographyP>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type UseCaseDifferentiatorSectionProps = {
  content: UseCasePageContent["differentiator"];
};

export function UseCaseDifferentiatorSection({ content }: UseCaseDifferentiatorSectionProps) {
  return (
    <section>
      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div className="max-w-3xl space-y-5">
          <div className="text-sm text-muted-foreground/60">
            <UseCaseMessage messageKey={content.labelKey} />
          </div>
          <TypographyH2 className="text-4xl text-balance sm:text-5xl">
            <UseCaseMessage messageKey={content.titleKey} />
          </TypographyH2>
          <TypographyP className="max-w-2xl text-muted-foreground">
            <UseCaseMessage messageKey={content.descriptionKey} />
          </TypographyP>
        </div>

        <div className="space-y-4">
          {content.pointKeys.map((pointKey, index) => (
            <div
              key={pointKey}
              className="flex gap-4 border-t border-border/70 pt-4 text-sm text-muted-foreground"
            >
              <span className="min-w-8 text-foreground/40">{formatStepLabel(index)}</span>
              <span>
                <UseCaseMessage messageKey={pointKey} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type UseCaseScenarioSectionProps = {
  content: UseCasePageContent["scenario"];
};

export function UseCaseScenarioSection({ content }: UseCaseScenarioSectionProps) {
  return (
    <section>
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.4fr] lg:items-start">
        <div className="max-w-2xl space-y-5">
          <div className="text-sm text-muted-foreground/60">
            <UseCaseMessage messageKey={content.labelKey} />
          </div>
          <TypographyH2 className="text-4xl sm:text-5xl">
            <UseCaseMessage messageKey={content.titleKey} />
          </TypographyH2>
        </div>

        <TypographyP className="max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl sm:leading-8">
          <UseCaseMessage messageKey={content.narrativeKey} />
        </TypographyP>
      </div>
    </section>
  );
}

type UseCaseCtaSectionProps = {
  content: UseCasePageContent["cta"];
};

export function UseCaseCtaSection({ content }: UseCaseCtaSectionProps) {
  return (
    <section id="waitlist" className="text-center">
      <TypographyH2 className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl">
        <UseCaseMessage messageKey={content.headlineKey} />
      </TypographyH2>
      <TypographyP className="mx-auto mt-5 max-w-2xl text-muted-foreground">
        <UseCaseMessage messageKey={content.descriptionKey} />
      </TypographyP>
      <div className="mt-8 flex justify-center">
        <Button
          className="rounded-full px-5"
          nativeButton={false}
          render={
            <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <UseCaseMessage messageKey={content.primaryLabelKey} />
        </Button>
      </div>
    </section>
  );
}
