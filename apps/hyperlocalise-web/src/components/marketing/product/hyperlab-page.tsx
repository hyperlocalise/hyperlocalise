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
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  DUSK_MESH_GRADIENT_SRC,
  LAVENDER_MESH_GRADIENT_SRC,
  MeshStage,
  ROSE_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
  SectionMeshBackground,
} from "@/components/marketing/hero-frame-mesh-stage";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";

import {
  HyperlabAudiencesPanel,
  HyperlabExperimentsPanel,
  HyperlabFlagsPanel,
  HyperlabMockUI,
  type HyperlabSceneId,
} from "./hyperlab-mock-ui";
import { hyperlabPageMessages as messages } from "./hyperlab-page.messages";

const solutionIds = [
  "flags",
  "experiments",
  "audiences",
] as const satisfies readonly HyperlabSceneId[];

const solutionLabelKeys = {
  flags: "solutionFlags",
  experiments: "solutionExperiments",
  audiences: "solutionAudiences",
} as const;

const solutionCopyKeys = {
  flags: {
    title: "flagsTitle",
    body: "flagsBody",
    link: "flagsLink",
  },
  experiments: {
    title: "experimentsTitle",
    body: "experimentsBody",
    link: "experimentsLink",
  },
  audiences: {
    title: "audiencesTitle",
    body: "audiencesBody",
    link: "audiencesLink",
  },
} as const;

const faqMessageKeys = [
  ["faqWhatQuestion", "faqWhatAnswer"],
  ["faqFlagQuestion", "faqFlagAnswer"],
  ["faqExperimentQuestion", "faqExperimentAnswer"],
  ["faqAudienceQuestion", "faqAudienceAnswer"],
  ["faqCmsQuestion", "faqCmsAnswer"],
  ["faqFitQuestion", "faqFitAnswer"],
  ["faqWhoQuestion", "faqWhoAnswer"],
  ["faqStartQuestion", "faqStartAnswer"],
] as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function HyperlabPreview() {
  return (
    <div id="hyperlab" className="mx-auto max-w-6xl">
      <MeshStage
        className="w-full"
        contentClassName="px-3 pt-3 pb-0 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10"
        meshSrc={LAVENDER_MESH_GRADIENT_SRC}
        priority
      >
        <HyperlabMockUI
          priority
          showMesh={false}
          className="rounded-t-xl rounded-b-none border-0 shadow-2xl shadow-[#172541]/20"
        />
      </MeshStage>
    </div>
  );
}

function SolutionPreview({
  solution,
  rolloutPercent,
  onRolloutChange,
  showEvaluate,
  onEvaluate,
}: {
  solution: HyperlabSceneId;
  rolloutPercent: number;
  onRolloutChange: (value: number) => void;
  showEvaluate: boolean;
  onEvaluate: () => void;
}) {
  const intl = useIntl();

  if (solution === "experiments") {
    return (
      <div className="relative isolate flex min-h-80 flex-1 flex-col justify-center gap-4 overflow-hidden p-4 sm:p-6">
        <SectionMeshBackground src={ROSE_MESH_GRADIENT_SRC} className="opacity-75" />
        <div className="relative flex flex-wrap gap-2">
          {([25, 50, 75] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRolloutChange(value)}
              className={cn(
                "min-h-11 rounded-md border px-3 text-sm",
                rolloutPercent === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/80 text-muted-foreground hover:text-foreground",
              )}
            >
              <FormattedMessage
                {...(value === 25
                  ? messages.rollout25
                  : value === 50
                    ? messages.rollout50
                    : messages.rollout75)}
              />
            </button>
          ))}
        </div>
        <div className="relative">
          <HyperlabExperimentsPanel rolloutPercent={rolloutPercent} />
        </div>
        <span className="sr-only">
          {intl.formatMessage(messages.experimentsTitle)} {rolloutPercent}%
        </span>
      </div>
    );
  }

  if (solution === "audiences") {
    return (
      <div className="relative isolate flex min-h-80 flex-1 flex-col justify-center gap-4 overflow-hidden p-4 sm:p-6">
        <SectionMeshBackground src={SAGE_MESH_GRADIENT_SRC} className="opacity-80" />
        <div className="relative">
          <HyperlabAudiencesPanel showEvaluate={showEvaluate} />
        </div>
        {showEvaluate ? null : (
          <div className="relative">
            <Button type="button" variant="outline" onClick={onEvaluate}>
              <FormattedMessage {...messages.evaluateAction} />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-80 flex-1 items-center overflow-hidden p-4 sm:p-6">
      <SectionMeshBackground src={LAVENDER_MESH_GRADIENT_SRC} className="opacity-80" />
      <div className="relative w-full">
        <HyperlabFlagsPanel />
      </div>
    </div>
  );
}

function HyperlabSolutions() {
  const intl = useIntl();
  const [solution, setSolution] = useState<HyperlabSceneId>("flags");
  const [rolloutPercent, setRolloutPercent] = useState(50);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const copy = solutionCopyKeys[solution];

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>
              <FormattedMessage {...messages.solutionsEyebrow} />
            </Eyebrow>
            <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
              <FormattedMessage {...messages.solutionsHeadline} />
            </h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.solutionsBody} />
          </p>
        </div>
        <div
          className="mt-10 flex gap-7 overflow-x-auto"
          role="tablist"
          aria-label={intl.formatMessage(messages.solutionsAriaLabel)}
        >
          {solutionIds.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={solution === item}
              onClick={() => {
                setSolution(item);
                setShowEvaluate(false);
              }}
              className={
                solution === item
                  ? "shrink-0 border-b-2 border-primary pb-3 text-sm text-primary"
                  : "shrink-0 pb-3 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              <FormattedMessage {...messages[solutionLabelKeys[item]]} />
            </button>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-xl bg-muted lg:flex">
          <div className="flex w-full shrink-0 flex-col justify-center gap-5 bg-background/55 p-8 lg:w-[34%] lg:p-12">
            <h3 className="whitespace-pre-line text-2xl leading-8 font-semibold tracking-tight">
              <FormattedMessage {...messages[copy.title]} />
            </h3>
            <p className="text-base leading-7 text-muted-foreground">
              <FormattedMessage {...messages[copy.body]} />
            </p>
            <p className="pt-2 text-sm text-primary">
              <FormattedMessage {...messages[copy.link]} /> ↗
            </p>
          </div>
          <SolutionPreview
            solution={solution}
            rolloutPercent={rolloutPercent}
            onRolloutChange={setRolloutPercent}
            showEvaluate={showEvaluate}
            onEvaluate={() => setShowEvaluate(true)}
          />
        </div>
      </div>
    </section>
  );
}

function CompareSection() {
  const [winner, setWinner] = useState<"a" | "b" | null>(null);

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
        <div className="max-w-xl">
          <Eyebrow>
            <FormattedMessage {...messages.compareEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
            <FormattedMessage {...messages.compareHeadline} />
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.compareBody} />
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            <FormattedMessage {...messages.compareHint} />
          </p>
        </div>
        <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
          <SectionMeshBackground src={LAVENDER_MESH_GRADIENT_SRC} className="opacity-80" />
          <div className="relative grid gap-4 sm:grid-cols-2">
            {(
              [
                ["a", "compareVersionA", "compareHeadlineA", "compareCtaA"],
                ["b", "compareVersionB", "compareHeadlineB", "compareCtaB"],
              ] as const
            ).map(([id, version, headline, cta]) => {
              const selected = winner === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWinner(id)}
                  className={cn(
                    "rounded-xl border bg-card p-6 text-left text-card-foreground transition-colors",
                    selected ? "border-primary ring-2 ring-primary/30" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">
                      <FormattedMessage {...messages[version]} />
                    </span>
                    {selected ? (
                      <span className="text-primary">
                        <FormattedMessage {...messages.compareWinner} />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-5 font-heading text-2xl leading-tight">
                    <FormattedMessage {...messages[headline]} />
                  </p>
                  <span className="mt-6 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                    <FormattedMessage {...messages[cta]} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  const [visitor, setVisitor] = useState<"everyone" | "pro">("everyone");
  const seesTreatment = visitor === "pro";

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
          <SectionMeshBackground src={ROSE_MESH_GRADIENT_SRC} className="opacity-75" />
          <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap justify-between gap-3 bg-muted/60 p-5 text-sm">
              <b>
                <FormattedMessage {...messages.audienceVisitor} />
              </b>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisitor("everyone")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    visitor === "everyone"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  <FormattedMessage {...messages.audienceEveryone} />
                </button>
                <button
                  type="button"
                  onClick={() => setVisitor("pro")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    visitor === "pro"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  <FormattedMessage {...messages.audienceProFrance} />
                </button>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-medium text-primary">
                <FormattedMessage
                  {...(seesTreatment
                    ? messages.audiencePreviewTreatment
                    : messages.audiencePreviewOriginal)}
                />
              </p>
              <p className="mt-4 font-heading text-3xl leading-tight">
                <FormattedMessage
                  {...(seesTreatment ? messages.compareHeadlineB : messages.compareHeadlineA)}
                />
              </p>
              <span className="mt-6 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                <FormattedMessage
                  {...(seesTreatment ? messages.compareCtaB : messages.compareCtaA)}
                />
              </span>
            </div>
          </div>
        </div>
        <div>
          <Eyebrow>
            <FormattedMessage {...messages.audienceEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
            <FormattedMessage {...messages.audienceHeadline} />
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.audienceBody} />
          </p>
        </div>
      </div>
    </section>
  );
}

export function HyperlabPage() {
  const locale = useAppLocale();
  const intl = useIntl();
  const faqItems = faqMessageKeys.map(([question, answer]) => ({
    question: intl.formatMessage(messages[question]),
    answer: intl.formatMessage(messages[answer]),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div>
        <section className="bg-background px-5 py-20 text-center text-foreground sm:px-8 sm:py-24 lg:px-10">
          <div className="mx-auto flex max-w-3xl flex-col items-center">
            <Eyebrow>
              <FormattedMessage {...messages.heroEyebrow} />
            </Eyebrow>
            <h1 className="mt-6 whitespace-pre-line font-heading text-[clamp(3rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.045em]">
              <FormattedMessage {...messages.heroHeadline} />
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              <FormattedMessage {...messages.heroSubcopy} />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                nativeButton={false}
                render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              >
                <FormattedMessage {...messages.requestDemo} />{" "}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<a href="#hyperlab" />}
              >
                <FormattedMessage {...messages.exploreHyperlab} /> ↓
              </Button>
            </div>
          </div>
        </section>

        <section className="px-3 pb-0 sm:px-6 lg:px-8">
          <HyperlabPreview />
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 border-b border-border py-7 text-sm text-muted-foreground sm:flex-row">
            <span>
              <FormattedMessage {...messages.fromFlagToWinner} />
            </span>
            <span className="flex flex-wrap gap-x-7 gap-y-2">
              <span>
                <FormattedMessage {...messages.stepFlag} />
              </span>
              <span>
                <FormattedMessage {...messages.stepSplit} />
              </span>
              <span>
                <FormattedMessage {...messages.stepAudience} />
              </span>
              <span>
                <FormattedMessage {...messages.stepKeep} />
              </span>
            </span>
          </div>
        </section>

        <HyperlabSolutions />
        <CompareSection />
        <AudienceSection />

        <section className="mx-auto max-w-7xl border-y border-border px-5 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-medium tracking-tight">
                <FormattedMessage {...messages.connectedHeadline} />
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                <FormattedMessage {...messages.connectedBody} />
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Link
                href={rewriteAppLocalePath("/product/multilingual-content-studio", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.contentStudio} /> ↗
              </Link>
              <Link
                href={rewriteAppLocalePath("/product/domains", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.domains} /> ↗
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <HomepageFaqSection
            items={faqItems}
            heading={
              <span className="whitespace-pre-line">
                <FormattedMessage {...messages.faqHeading} />
              </span>
            }
            subheading={<FormattedMessage {...messages.faqSubheading} />}
          />
        </div>

        <section className="px-5 pb-20 sm:px-8 lg:px-10">
          <MeshStage
            className="mx-auto max-w-7xl"
            contentClassName="p-0"
            meshSrc={DUSK_MESH_GRADIENT_SRC}
            mixSrc={ROSE_MESH_GRADIENT_SRC}
          >
            <div className="flex flex-col justify-between gap-10 bg-[#172541]/45 p-8 text-[#f8f0f5] sm:p-12 lg:flex-row lg:items-center lg:p-16">
              <div>
                <h2 className="whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
                  <FormattedMessage {...messages.ctaHeadline} />
                </h2>
                <p className="mt-5 text-lg text-[#e5edf9]">
                  <FormattedMessage {...messages.ctaBody} />
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-center">
                <Button
                  size="lg"
                  className="bg-[#ebc36a] text-[#172541] hover:bg-[#f2db9b]"
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
                >
                  <FormattedMessage {...messages.requestDemo} />{" "}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                </Button>
                <span className="text-xs text-[#e5edf9]">
                  <FormattedMessage {...messages.ctaNote} />
                </span>
              </div>
            </div>
          </MeshStage>
        </section>

        <section className="border-t border-border px-5 pt-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </div>
    </div>
  );
}
