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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { irisLaunchPosterSrc } from "@/lib/iris/iris-waitlist";
import { cn } from "@/lib/primitives/cn";
import {
  BLUSH_MESH_GRADIENT_SRC,
  DUSK_MESH_GRADIENT_SRC,
  LAVENDER_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
  SectionMeshBackground,
} from "../hero-frame-mesh-stage";
import { IrisVideoBackground } from "../iris/iris-video-background";
import { irisPageMessages } from "../iris/iris-page.messages";
import { IrisWaitlistCta } from "../iris/iris-waitlist-cta";
import { CompliancePanel } from "../product/guideline-mock-ui";
import { HyperlabExperimentsPanel } from "../product/hyperlab-mock-ui";
import type { IntegrationIconKey } from "@/lib/integrations/integration-catalog.types";
import { IntegrationLogoMark } from "../integrations/integration-logo-mark";
import { useCaseFooterLinks } from "../use-case/use-case-page-content";
import { useCasePageMessages } from "../use-case/use-case-page-content.messages";
import { homepageMessages as m } from "./homepage.messages";

const SECTION_CLASS = "mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10";
const HEADING_CLASS = "font-heading text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.1] text-balance";
const STEP_MS = 3200;

const TMS_STEPS = 4;
type LocaleStatus = "translating" | "review" | "synced";
const TMS_LOCALES = ["FR", "DE", "JA", "VI"] as const;
const TMS_STATUS_LABELS: Record<LocaleStatus, MessageDescriptor> = {
  translating: m.tmsPanelTranslating,
  review: m.tmsPanelReview,
  synced: m.tmsPanelSynced,
};
const HYPERLAB_ROLLOUT = [10, 50, 100];
const COMPLIANCE_STEPS = [0, 1, 2, 3];

/** Steps through `length` frames on a timer; holds the last frame when motion is reduced. */
function useStep(length: number) {
  const shouldReduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }
    const timer = setInterval(() => setIndex((value) => (value + 1) % length), STEP_MS);
    return () => clearInterval(timer);
  }, [length, shouldReduceMotion]);

  return shouldReduceMotion ? length - 1 : index;
}

function SectionLink({ href, label }: { href: string; label: MessageDescriptor }) {
  const locale = useAppLocale();
  return (
    <Link
      href={rewriteAppLocalePath(href, locale)}
      className="rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <FormattedMessage {...label} /> <span aria-hidden>↗</span>
    </Link>
  );
}

function FeatureCopy({
  eyebrow,
  title,
  body,
  children,
  headingId,
  onDark = false,
}: {
  eyebrow: MessageDescriptor;
  title: MessageDescriptor;
  body: MessageDescriptor;
  children?: ReactNode;
  headingId: string;
  onDark?: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-5">
      <p
        className={cn(
          "text-xs font-semibold tracking-[0.16em] uppercase",
          onDark ? "text-white/70" : "text-primary",
        )}
      >
        <FormattedMessage {...eyebrow} />
      </p>
      <h2 id={headingId} className={HEADING_CLASS}>
        <FormattedMessage {...title} />
      </h2>
      <p
        className={cn(
          "max-w-xl text-base leading-7 text-pretty",
          onDark ? "text-white/80" : "text-muted-foreground",
        )}
      >
        <FormattedMessage {...body} />
      </p>
      {children}
    </div>
  );
}

function MockStage({ meshSrc, children }: { meshSrc: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative isolate flex min-h-80 items-center justify-center overflow-hidden rounded-[1.5rem] p-5 sm:min-h-96 sm:p-10"
    >
      <Image
        src={meshSrc}
        alt=""
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-white/25" />
      <div className="pointer-events-none w-full max-w-lg select-none">{children}</div>
    </div>
  );
}

function FeatureRow({
  copy,
  visual,
  reversed = false,
}: {
  copy: ReactNode;
  visual: ReactNode;
  reversed?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reversed && "lg:order-2")}>{copy}</div>
      <div className={cn(reversed && "lg:order-1")}>{visual}</div>
    </div>
  );
}

type PillarDetail = { title: MessageDescriptor; body: MessageDescriptor };

const LANGUAGE_DETAILS: PillarDetail[] = [
  { title: m.languageDetailContinuousTitle, body: m.languageDetailContinuousBody },
  { title: m.languageDetailMemoryTitle, body: m.languageDetailMemoryBody },
  { title: m.languageDetailReviewTitle, body: m.languageDetailReviewBody },
  { title: m.languageDetailFormatsTitle, body: m.languageDetailFormatsBody },
];

const CULTURE_DETAILS: PillarDetail[] = [
  { title: m.cultureDetailAdsTitle, body: m.cultureDetailAdsBody },
  { title: m.cultureDetailVideoTitle, body: m.cultureDetailVideoBody },
  { title: m.cultureDetailCampaignTitle, body: m.cultureDetailCampaignBody },
  { title: m.cultureDetailLayoutTitle, body: m.cultureDetailLayoutBody },
];

const COMPLIANCE_DETAILS: PillarDetail[] = [
  { title: m.complianceDetailPoliciesTitle, body: m.complianceDetailPoliciesBody },
  { title: m.complianceDetailRegulationTitle, body: m.complianceDetailRegulationBody },
  { title: m.complianceDetailBrandTitle, body: m.complianceDetailBrandBody },
  { title: m.complianceDetailBlockTitle, body: m.complianceDetailBlockBody },
];

/** Four capability columns under a pillar's feature row. */
function PillarDetails({ items, onDark = false }: { items: PillarDetail[]; onDark?: boolean }) {
  return (
    <ul className="mt-14 grid gap-x-8 gap-y-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.title.id}
          className={cn(
            "flex flex-col gap-2 border-t pt-5",
            onDark ? "border-white/25" : "border-border",
          )}
        >
          <h3 className="text-base font-semibold leading-snug tracking-[-0.01em] text-balance">
            <FormattedMessage {...item.title} />
          </h3>
          <p
            className={cn(
              "text-sm leading-6 text-pretty",
              onDark ? "text-white/75" : "text-muted-foreground",
            )}
          >
            <FormattedMessage {...item.body} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export function GrowthStackOverview() {
  const columns = [
    {
      label: m.stackLanguageLabel,
      title: m.stackLanguageTitle,
      body: m.stackLanguageBody,
      meshSrc: SAGE_MESH_GRADIENT_SRC,
    },
    {
      label: m.stackCultureLabel,
      title: m.stackCultureTitle,
      body: m.stackCultureBody,
      meshSrc: BLUSH_MESH_GRADIENT_SRC,
    },
    {
      label: m.stackComplianceLabel,
      title: m.stackComplianceTitle,
      body: m.stackComplianceBody,
      meshSrc: LAVENDER_MESH_GRADIENT_SRC,
    },
  ];

  return (
    <section id="stack" aria-labelledby="stack-heading" className="scroll-mt-16">
      <div className={SECTION_CLASS}>
        <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-4 text-center sm:mb-14">
          <h2 id="stack-heading" className={HEADING_CLASS}>
            <FormattedMessage {...m.stackTitle} />
          </h2>
          <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground">
            <FormattedMessage {...m.stackBody} />
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {columns.map((column, index) => (
            <li
              key={column.label.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border"
            >
              <div className="relative isolate flex h-36 items-end overflow-hidden px-6 pb-5 text-white">
                <Image
                  src={column.meshSrc}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="-z-20 object-cover"
                />
                <div aria-hidden className="absolute inset-0 -z-10 bg-black/25" />
                <p className="text-xs font-semibold tracking-[0.16em] uppercase">
                  <span className="mr-2 text-white/70">0{index + 1}</span>
                  <FormattedMessage {...column.label} />
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-6">
                <h3 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-balance">
                  <FormattedMessage {...column.title} />
                </h3>
                <p className="text-sm leading-6 text-pretty text-muted-foreground">
                  <FormattedMessage {...column.body} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** A release moving through the translation layer: AI draft, human review, TMS sync. */
function TranslationPipelinePanel({ step }: { step: number }) {
  const rows = TMS_LOCALES.map((locale, index) => {
    const stage = step - index + 1;
    const status: LocaleStatus = stage >= 2 ? "synced" : stage === 1 ? "review" : "translating";
    const progress = status === "translating" ? 40 + ((step + index) % 3) * 20 : 100;
    return { locale, status, progress };
  });

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-background/90 shadow-lg backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...m.tmsPanelTitle} />
          </div>
          <div className="text-xs text-muted-foreground">
            <FormattedMessage {...m.tmsPanelSubtitle} />
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
          <FormattedMessage {...m.tmsPanelLive} />
        </span>
      </div>
      <div className="space-y-2 px-4 py-4">
        {rows.map((row) => (
          <div
            key={row.locale}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5",
              row.status === "review" ? "border-primary/30 bg-primary/5" : "border-border/40",
            )}
          >
            <span className="w-6 text-[11px] font-semibold text-foreground">{row.locale}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/50">
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${row.progress}%` }}
              />
            </div>
            <span
              className={cn(
                "w-24 shrink-0 text-right text-[11px]",
                row.status === "synced" ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {row.status === "synced" ? "✓ " : null}
              <FormattedMessage {...TMS_STATUS_LABELS[row.status]} />
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 border-t border-border/50 text-xs">
        <div className="border-r border-border/50 px-4 py-3">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <FormattedMessage {...m.tmsPanelMemory} />
          </div>
          <div className="mt-1 font-medium text-foreground">
            <FormattedMessage {...m.tmsPanelMemoryValue} values={{ percent: 64 }} />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <FormattedMessage {...m.tmsPanelGlossary} />
          </div>
          <div className="mt-1 font-medium text-foreground">
            <FormattedMessage {...m.tmsPanelGlossaryValue} values={{ count: 12 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export type HomepageIntegration = {
  slug: string;
  name: string;
  logoSrc?: string;
  iconKey?: IntegrationIconKey;
};

/** Simple integrations list sourced from the marketing integration catalog. */
export function IntegrationsSection({ integrations }: { integrations: HomepageIntegration[] }) {
  const locale = useAppLocale();
  if (integrations.length === 0) {
    return null;
  }

  return (
    <section id="integrations" aria-labelledby="integrations-heading" className="scroll-mt-16">
      <div className={SECTION_CLASS}>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2
            id="integrations-heading"
            className="font-heading text-[clamp(2rem,3vw,2.75rem)] leading-[1.1] text-balance"
          >
            <FormattedMessage {...m.integrationsTitle} />
          </h2>
          <p className="text-lg leading-8 text-pretty text-muted-foreground">
            <FormattedMessage {...m.integrationsBody} />
          </p>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          <FormattedMessage {...m.integrationsLabel} />
        </p>
        <ul className="mt-4 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          {integrations.map((integration) => (
            <li key={integration.slug}>
              <Link
                href={rewriteAppLocalePath(`/integrations/${integration.slug}`, locale)}
                className="group flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <IntegrationLogoMark
                  name={integration.name}
                  logoSrc={integration.logoSrc}
                  iconKey={integration.iconKey}
                  size="sm"
                />
                <span className="text-base text-muted-foreground transition-colors group-hover:text-foreground motion-reduce:transition-none">
                  {integration.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <SectionLink href="/integrations" label={m.integrationsAll} />
        </div>
      </div>
    </section>
  );
}

const DOCS_ORIGIN = "https://hyperlocalise.dev";

const QUICK_START_GUIDES: (PillarDetail & { href: string })[] = [
  {
    title: m.guideMoveTitle,
    body: m.guideMoveBody,
    href: `${DOCS_ORIGIN}/platform/getting-started/moving-to-hyperlocalise`,
  },
  {
    title: m.guideManagersTitle,
    body: m.guideManagersBody,
    href: `${DOCS_ORIGIN}/platform/getting-started/managers`,
  },
  {
    title: m.guideGithubTitle,
    body: m.guideGithubBody,
    href: `${DOCS_ORIGIN}/platform/tutorials/github-localisation-workflow`,
  },
  {
    title: m.guideSanityTitle,
    body: m.guideSanityBody,
    href: `${DOCS_ORIGIN}/platform/connections/sanity-studio-plugin`,
  },
  {
    title: m.guideCliTitle,
    body: m.guideCliBody,
    href: `${DOCS_ORIGIN}/cli/getting-started/quickstart`,
  },
  {
    title: m.guideTmTitle,
    body: m.guideTmBody,
    href: `${DOCS_ORIGIN}/platform/translation-memory-import-export`,
  },
];

/** Brief list of docs guides that get a team started quickly. */
export function QuickStartGuidesSection() {
  return (
    <section
      id="quick-start"
      aria-labelledby="quick-start-heading"
      className="scroll-mt-16 border-t border-border"
    >
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2
              id="quick-start-heading"
              className="font-heading text-[clamp(1.75rem,2.5vw,2.25rem)] leading-[1.15] text-balance"
            >
              <FormattedMessage {...m.guidesTitle} />
            </h2>
            <p className="text-base leading-7 text-pretty text-muted-foreground">
              <FormattedMessage {...m.guidesBody} />
            </p>
          </div>
          <a
            href={DOCS_ORIGIN}
            className="rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <FormattedMessage {...m.guidesAll} /> <span aria-hidden>↗</span>
          </a>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_START_GUIDES.map((guide) => (
            <li key={guide.href}>
              <a
                href={guide.href}
                className="flex h-full flex-col gap-1.5 rounded-xl border border-border px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
              >
                <span className="flex items-center justify-between gap-3 text-sm font-semibold">
                  <FormattedMessage {...guide.title} />
                  <span aria-hidden className="text-muted-foreground">
                    ↗
                  </span>
                </span>
                <span className="text-sm leading-6 text-pretty text-muted-foreground">
                  <FormattedMessage {...guide.body} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LanguageSection() {
  const step = useStep(TMS_STEPS);

  return (
    <section id="language" aria-labelledby="language-heading" className="scroll-mt-16 bg-muted">
      <div className={SECTION_CLASS}>
        <FeatureRow
          copy={
            <FeatureCopy
              eyebrow={m.languageEyebrow}
              title={m.languageTitle}
              body={m.languageBody}
              headingId="language-heading"
            >
              <p className="max-w-xl rounded-lg border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground">
                <FormattedMessage {...m.languageMigrationNote} />
              </p>
              <SectionLink href="/product/multilingual-content-studio" label={m.languageLink} />
            </FeatureCopy>
          }
          visual={
            <MockStage meshSrc={SAGE_MESH_GRADIENT_SRC}>
              <TranslationPipelinePanel step={step} />
            </MockStage>
          }
        />
        <PillarDetails items={LANGUAGE_DETAILS} />
        <p className="mt-10 text-sm leading-6 text-muted-foreground">
          <FormattedMessage {...m.languagePublishNote} />
        </p>
      </div>
    </section>
  );
}

/** Shows the Iris launch poster until the panel scrolls into view, then loads the film. */
function IrisFilmPanel() {
  const intl = useIntl();
  const panelRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || inView) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [inView]);

  return (
    <div
      ref={panelRef}
      className="relative aspect-video w-full overflow-hidden rounded-[1.5rem] bg-background shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
    >
      {inView ? (
        <IrisVideoBackground />
      ) : (
        <img
          alt={intl.formatMessage(irisPageMessages.videoLabel)}
          src={irisLaunchPosterSrc()}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  );
}

export function CultureSection() {
  const rolloutIndex = useStep(HYPERLAB_ROLLOUT.length);

  return (
    <section id="culture" aria-labelledby="culture-heading" className="scroll-mt-16">
      <div className="relative isolate overflow-hidden text-white">
        <SectionMeshBackground src={DUSK_MESH_GRADIENT_SRC} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/30" />
        <div className={SECTION_CLASS}>
          <FeatureRow
            copy={
              <FeatureCopy
                eyebrow={m.cultureEyebrow}
                title={m.cultureTitle}
                body={m.cultureBody}
                headingId="culture-heading"
                onDark
              >
                <div className="mt-2 flex flex-wrap items-center gap-5 text-foreground">
                  <IrisWaitlistCta />
                  <span className="text-white">
                    <SectionLink href="/iris" label={m.cultureLink} />
                  </span>
                </div>
              </FeatureCopy>
            }
            visual={<IrisFilmPanel />}
          />
          <PillarDetails items={CULTURE_DETAILS} onDark />
        </div>
      </div>
      <div className={SECTION_CLASS}>
        <FeatureRow
          reversed
          copy={
            <FeatureCopy
              eyebrow={m.hyperlabEyebrow}
              title={m.hyperlabTitle}
              body={m.hyperlabBody}
              headingId="hyperlab-heading"
            >
              <SectionLink href="/product/hyperlab" label={m.hyperlabLink} />
            </FeatureCopy>
          }
          visual={
            <MockStage meshSrc={BLUSH_MESH_GRADIENT_SRC}>
              <HyperlabExperimentsPanel rolloutPercent={HYPERLAB_ROLLOUT[rolloutIndex]!} />
            </MockStage>
          }
        />
      </div>
    </section>
  );
}

export function ComplianceSection() {
  const checkedIndex = useStep(COMPLIANCE_STEPS.length);

  return (
    <section
      id="compliance"
      aria-labelledby="compliance-heading"
      className="scroll-mt-16 border-t border-border"
    >
      <div className={SECTION_CLASS}>
        <FeatureRow
          copy={
            <FeatureCopy
              eyebrow={m.complianceEyebrow}
              title={m.complianceTitle}
              body={m.complianceBody}
              headingId="compliance-heading"
            >
              <SectionLink href="/product/guidelines" label={m.complianceLink} />
            </FeatureCopy>
          }
          visual={
            <MockStage meshSrc={LAVENDER_MESH_GRADIENT_SRC}>
              <CompliancePanel checkedCount={COMPLIANCE_STEPS[checkedIndex]!} />
            </MockStage>
          }
        />
        <PillarDetails items={COMPLIANCE_DETAILS} />
      </div>
    </section>
  );
}

const AUDIT_CHECKS: PillarDetail[] = [
  { title: m.auditTechnicalTitle, body: m.auditTechnicalBody },
  { title: m.auditLinguisticTitle, body: m.auditLinguisticBody },
  { title: m.auditContextualTitle, body: m.auditContextualBody },
  { title: m.auditVisualTitle, body: m.auditVisualBody },
];

export function LocalisationAuditCta() {
  const locale = useAppLocale();
  return (
    <section aria-labelledby="audit-heading" className="px-5 sm:px-8 lg:px-10">
      <div className="relative isolate mx-auto flex max-w-7xl flex-col gap-10 overflow-hidden rounded-[1.5rem] px-6 py-12 text-white sm:px-12">
        <SectionMeshBackground src={SAGE_MESH_GRADIENT_SRC} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/35" />
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-xl flex-col gap-3">
            <h2 id="audit-heading" className="font-heading text-3xl leading-tight text-balance">
              <FormattedMessage {...m.auditTitle} />
            </h2>
            <p className="text-base leading-7 text-pretty text-white/80">
              <FormattedMessage {...m.auditBody} />
            </p>
          </div>
          <Link
            href={rewriteAppLocalePath("/localisation-audit", locale)}
            className="shrink-0 rounded-md bg-white px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
          >
            <FormattedMessage {...m.auditCta} /> <span aria-hidden>↗</span>
          </Link>
        </div>
        <ul className="grid gap-x-8 gap-y-6 border-t border-white/20 pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIT_CHECKS.map((check) => (
            <li key={check.title.id} className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-white">
                <FormattedMessage {...check.title} />
              </span>
              <span className="text-sm leading-6 text-pretty text-white/75">
                <FormattedMessage {...check.body} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function UseCasesSection() {
  const locale = useAppLocale();
  return (
    <section id="use-cases" aria-labelledby="use-cases-heading" className="scroll-mt-16">
      <div className={SECTION_CLASS}>
        <div className="mx-auto mb-10 flex max-w-3xl flex-col items-center gap-4 text-center sm:mb-14">
          <h2 id="use-cases-heading" className={HEADING_CLASS}>
            <FormattedMessage {...m.useCasesTitle} />
          </h2>
          <p className="max-w-2xl text-base leading-7 text-pretty text-muted-foreground">
            <FormattedMessage {...m.useCasesBody} />
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {useCaseFooterLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={rewriteAppLocalePath(link.href, locale)}
                className="flex items-center justify-between gap-4 rounded-xl border border-border px-5 py-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transition-none"
              >
                <FormattedMessage {...useCasePageMessages[link.useCaseLabelKey]} />
                <span aria-hidden>↗</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
