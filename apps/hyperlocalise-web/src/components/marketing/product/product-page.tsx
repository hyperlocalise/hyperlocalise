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
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import { HeroFrameMeshStage } from "@/components/marketing/hero-frame-mesh-stage";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import type { ProductPageContent, ProductVisualKind } from "./product-page-content";
import { AutomationsMockUI } from "./automations-mock-ui";
import { productPageMessages, type ProductMessageKey } from "./product-page-content.messages";
import { AutomationEditorMock } from "./automation-editor-mock";
import { IntegrationStripSection } from "./integration-strip-section";
import { GlobeHeroVisual } from "./globe-hero-visual";

type ProductPageProps = {
  content: ProductPageContent;
};

function ProductMessage({ messageKey }: { messageKey: ProductMessageKey }) {
  return <FormattedMessage {...productPageMessages[messageKey]} />;
}

function ProductEyebrow({ messageKey }: { messageKey: ProductMessageKey }) {
  return (
    <div className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
      <ProductMessage messageKey={messageKey} />
    </div>
  );
}

function ProductHero({ content }: ProductPageProps) {
  const isAutomation = content.visualKind === "automation";

  return (
    <div className="flex flex-col gap-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-xl flex-col gap-8 text-center lg:text-left">
          <div className="flex flex-col gap-8">
            <h1 className="font-heading text-[clamp(2.5rem,5vw,4.75rem)] leading-[1] font-semibold tracking-normal text-balance">
              <ProductMessage messageKey={content.hero.headlineKey} />
            </h1>
            <p className="max-w-lg text-md leading-8 text-muted-foreground text-balance sm:text-lg">
              <ProductMessage messageKey={content.hero.subcopyKey} />
            </p>
          </div>
          <div className="flex justify-center lg:justify-start">
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
            >
              <ProductMessage messageKey="ctaJoinWaitlist" />
              <ArrowRightIcon data-icon="inline-end" className="size-4" />
            </Button>
          </div>
        </div>

        {isAutomation && <GlobeHeroVisual />}
      </div>
      {isAutomation && (
        <div className="mx-auto w-full max-w-6xl border-t border-border/60 pt-10">
          <IntegrationStripSection />
        </div>
      )}
    </div>
  );
}

function AutomationPrimaryVisual() {
  const sources: ProductMessageKey[] = [
    "visualAutomationSourceGitHub",
    "visualAutomationSourceSlack",
    "visualAutomationSourceCms",
  ];
  const destinations: ProductMessageKey[] = [
    "visualAutomationDestReviewer",
    "visualAutomationDestTms",
    "visualAutomationDestRelease",
  ];
  const tasks: ProductMessageKey[] = [
    "visualAutomationTaskDetectChangedStrings",
    "visualAutomationTaskAttachProductContext",
    "visualAutomationTaskCreateReviewerTasks",
  ];

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-border bg-card p-4 shadow-2xl shadow-gray-alpha-100">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <div>
          <div className="text-sm font-semibold">
            <ProductMessage messageKey="visualAutomationLaunchRequest" />
          </div>
          <div className="text-xs text-muted-foreground">
            <ProductMessage messageKey="visualAutomationLocalesWaiting" />
          </div>
        </div>
        <div className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success-foreground dark:text-success">
          <ProductMessage messageKey="visualAutomationStatusRunning" />
        </div>
      </div>
      <div className="grid h-[calc(100%-4.5rem)] min-h-[24rem] gap-3 md:grid-cols-[0.8fr_1.15fr_0.8fr]">
        <div className="flex flex-col gap-2">
          {sources.map((sourceKey) => (
            <div key={sourceKey} className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">
                <ProductMessage messageKey="visualAutomationSignalLabel" />
              </div>
              <div className="text-sm font-semibold">
                <ProductMessage messageKey={sourceKey} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-primary/25 bg-primary/8 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">
                <ProductMessage messageKey="visualAutomationHyperlocaliseAgent" />
              </div>
              <div className="text-xs text-muted-foreground">
                <ProductMessage messageKey="visualAutomationScopeContextRoute" />
              </div>
            </div>
            <div className="size-2 rounded-full bg-primary" />
          </div>
          <div className="space-y-2">
            {tasks.map((taskKey) => (
              <div
                key={taskKey}
                className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-2 text-xs"
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-primary" />
                <ProductMessage messageKey={taskKey} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {destinations.map((destinationKey) => (
            <div key={destinationKey} className="rounded-md border border-border bg-background p-3">
              <div className="text-xs text-muted-foreground">
                <ProductMessage messageKey="visualAutomationRouteLabel" />
              </div>
              <div className="text-sm font-semibold">
                <ProductMessage messageKey={destinationKey} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KnowledgePrimaryVisual() {
  const nodes: ProductMessageKey[] = [
    "visualKnowledgeNodeProductDocs",
    "visualKnowledgeNodeGlossary",
    "visualKnowledgeNodeTranslations",
    "visualKnowledgeNodeReviewers",
    "visualKnowledgeNodeMarkets",
    "visualKnowledgeNodeAgents",
  ];

  return (
    <div className="h-full rounded-lg border border-border bg-card p-5 shadow-2xl shadow-gray-alpha-100">
      <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <div>
          <div className="text-sm font-semibold">
            <ProductMessage messageKey="visualKnowledgeMemoryLayerTitle" />
          </div>
          <div className="text-xs text-muted-foreground">
            <ProductMessage messageKey="visualKnowledgeSignalsCaptured" />
          </div>
        </div>
        <div className="rounded-full bg-secondary/25 px-3 py-1 text-xs font-medium">
          <ProductMessage messageKey="visualKnowledgeStatusLearning" />
        </div>
      </div>
      <div className="grid min-h-[20rem] gap-3 sm:grid-cols-3">
        {nodes.map((nodeKey, index) => (
          <div
            key={nodeKey}
            className={cn(
              "rounded-lg border p-4",
              index === 2 ? "border-primary/35 bg-primary/10" : "border-border bg-background",
            )}
          >
            <div className="mb-8 size-2 rounded-full bg-primary" />
            <div className="text-sm font-semibold">
              <ProductMessage messageKey={nodeKey} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {index === 2 ? (
                <ProductMessage messageKey="visualKnowledgeApprovedSourceOfTruth" />
              ) : (
                <ProductMessage messageKey="visualKnowledgeContextSignal" />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-muted/25 p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase">
          <ProductMessage messageKey="visualKnowledgeLatestDecision" />
        </div>
        <div className="mt-2 text-sm">
          <ProductMessage messageKey="visualKnowledgeLatestDecisionBody" />
        </div>
      </div>
    </div>
  );
}

function ProductVisual({ kind }: { kind: ProductVisualKind }) {
  if (kind === "automation") {
    return (
      <>
        <AutomationsMockUI />
      </>
    );
  }

  return <KnowledgePrimaryVisual />;
}

function ProductShowcase({ content }: ProductPageProps) {
  if (content.visualKind === "cat") {
    return <HeroFrameMeshStage priority />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -top-8 -bottom-10 rounded-lg bg-[radial-gradient(circle_at_top,rgba(96,116,9,0.16),transparent_58%),radial-gradient(circle_at_bottom_right,rgba(9,108,229,0.1),transparent_46%)] blur-3xl"
        />
        <div className="relative grid overflow-hidden rounded-lg border border-border bg-background p-2 shadow-2xl shadow-gray-alpha-100 sm:p-3">
          <ProductVisual kind={content.visualKind} />
        </div>
      </div>
    </div>
  );
}

function ProductDetailsSection({ content }: ProductPageProps) {
  return (
    <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <div className="max-w-xl lg:sticky lg:top-24">
        <ProductEyebrow messageKey="sectionHowItWorks" />
        <h2 className="mt-5 font-heading text-3xl leading-tight font-semibold tracking-normal text-balance sm:text-4xl">
          <ProductMessage messageKey={content.detailsHeadlineKey} />
        </h2>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          <ProductMessage messageKey={content.summaryKey} />
        </p>
      </div>

      <div className="divide-y divide-border/70 border-y border-border">
        {content.proofPoints.map((point) => (
          <div key={point.titleKey} className="grid gap-3 py-8 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="text-base font-semibold leading-7">
              <ProductMessage messageKey={point.titleKey} />
            </div>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              <ProductMessage messageKey={point.bodyKey} />
            </p>
          </div>
        ))}

        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold leading-7">
              <ProductMessage messageKey="exploreRestTitle" />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              <ProductMessage messageKey="exploreRestDescription" />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {content.related.map((link) => (
              <Button
                key={link.href}
                variant="outline"
                size="sm"
                className="rounded-full"
                nativeButton={false}
                render={<Link href={link.href} />}
              >
                <ProductMessage messageKey={link.labelKey} />
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  data-icon="inline-end"
                  className="size-3.5"
                />
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductCta({ content }: ProductPageProps) {
  return (
    <div id="waitlist" className="text-center">
      <h2 className="font-heading text-4xl leading-[1.04] font-semibold tracking-normal text-balance sm:text-5xl">
        <ProductMessage messageKey={content.cta.headlineKey} />
      </h2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          nativeButton={false}
          render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
        >
          <ProductMessage messageKey="ctaJoinEarlyAccess" />
        </Button>
      </div>
    </div>
  );
}

export function ProductPage({ content }: ProductPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <section className="px-5 py-20 sm:px-8 sm:py-24 lg:px-10 lg:py-20">
          <ProductHero content={content} />
        </section>

        <section className="px-3 pb-20 sm:px-6 lg:px-8">
          <ProductShowcase content={content} />
        </section>

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <ProductDetailsSection content={content} />
        </section>

        {content.visualKind === "automation" && (
          <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
            <AutomationEditorMock />
          </section>
        )}

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <ProductCta content={content} />
        </section>

        <section className="border-t border-border px-5 pt-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
