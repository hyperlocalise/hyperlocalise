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

import { ContentOpsMockAppShell } from "@/components/marketing/content-ops/content-ops-mock-app-shell";
import {
  DUSK_MESH_GRADIENT_SRC,
  LAVENDER_MESH_GRADIENT_SRC,
  MeshStage,
  ROSE_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
  SectionMeshBackground,
} from "@/components/marketing/hero-frame-mesh-stage";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import type { AppLocale } from "@/lib/app-i18n/locales";

import { GuidelinesBoardMock } from "./guidelines-board-mock";
import { guidelinesPageMessages as messages } from "./guidelines-page.messages";
import { KnowledgeWaveGlobe } from "./knowledge-wave-globe";

const sourceIds = ["drive", "notion", "sharepoint"] as const;
type SourceId = (typeof sourceIds)[number];

const sourceLabelKeys = {
  drive: "sourceDrive",
  notion: "sourceNotion",
  sharepoint: "sourceSharepoint",
} as const;

const sourceCopyKeys = {
  drive: {
    title: "sourceDriveTitle",
    body: "sourceDriveBody",
    link: "sourceDriveLink",
  },
  notion: {
    title: "sourceNotionTitle",
    body: "sourceNotionBody",
    link: "sourceNotionLink",
  },
  sharepoint: {
    title: "sourceSharepointTitle",
    body: "sourceSharepointBody",
    link: "sourceSharepointLink",
  },
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function GuidelinesPreview() {
  return (
    <div id="guidelines" className="mx-auto max-w-6xl">
      <MeshStage
        className="w-full"
        contentClassName="px-3 pt-3 pb-0 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10"
        meshSrc={SAGE_MESH_GRADIENT_SRC}
        priority
      >
        <ContentOpsMockAppShell
          activeTab="brand"
          size="viewport"
          className="rounded-t-xl rounded-b-none border-0 shadow-2xl shadow-[#172541]/20"
        >
          <GuidelinesBoardMock />
        </ContentOpsMockAppShell>
      </MeshStage>
    </div>
  );
}

function SourcePreview({ source }: { source: SourceId }) {
  if (source === "notion") {
    return (
      <div className="relative isolate flex min-h-80 flex-1 items-center overflow-hidden p-5 sm:p-8">
        <SectionMeshBackground src={LAVENDER_MESH_GRADIENT_SRC} className="opacity-80" />
        <div className="relative w-full rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <IntegrationLogoMark name="Notion" iconKey="notion" size="md" />
          <p className="mt-5 text-lg font-semibold">
            <FormattedMessage {...messages.sourceNotionFile} />
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <FormattedMessage {...messages.sourceNotionDetail} />
          </p>
        </div>
      </div>
    );
  }

  if (source === "sharepoint") {
    return (
      <div className="relative isolate flex min-h-80 flex-1 items-center overflow-hidden p-5 sm:p-8">
        <SectionMeshBackground src={ROSE_MESH_GRADIENT_SRC} className="opacity-75" />
        <div className="relative w-full rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <IntegrationLogoMark name="SharePoint" logoSrc="/images/sharepoint-logo.svg" size="md" />
          <p className="mt-5 text-lg font-semibold">
            <FormattedMessage {...messages.sourceSharepointFile} />
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <FormattedMessage {...messages.sourceSharepointDetail} />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-80 flex-1 items-center overflow-hidden p-5 sm:p-8">
      <SectionMeshBackground src={SAGE_MESH_GRADIENT_SRC} className="opacity-80" />
      <div className="relative w-full overflow-hidden rounded-xl border border-[#d9d2c3] bg-[#f7f4ee] p-6 text-[#1d1a16] shadow-sm">
        <div className="flex items-center gap-3">
          <IntegrationLogoMark name="Google Drive" iconKey="googledrive" size="md" />
          <div>
            <p className="text-sm font-semibold">
              <FormattedMessage {...messages.sourceDriveFile} />
            </p>
            <p className="text-xs text-[#6f675c]">
              <FormattedMessage {...messages.sourceDriveDetail} />
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <div className="h-2 w-2/3 rounded bg-[#e4ddd0]" />
          <div className="h-2 w-full rounded bg-[#e4ddd0]" />
          <div className="rounded-md border border-[#c45c3e] bg-[#f3d7cc] px-3 py-2 text-xs leading-5">
            <FormattedMessage {...messages.sourceDriveClause} />
          </div>
          <div className="h-2 w-5/6 rounded bg-[#e4ddd0]" />
        </div>
      </div>
    </div>
  );
}

function GuidelineSources() {
  const intl = useIntl();
  const [source, setSource] = useState<SourceId>("drive");
  const copy = sourceCopyKeys[source];

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>
              <FormattedMessage {...messages.sourcesEyebrow} />
            </Eyebrow>
            <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
              <FormattedMessage {...messages.sourcesHeadline} />
            </h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.sourcesBody} />
          </p>
        </div>
        <div
          className="mt-10 flex gap-7 overflow-x-auto"
          role="tablist"
          aria-label={intl.formatMessage(messages.sourcesAriaLabel)}
        >
          {sourceIds.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={source === item}
              onClick={() => setSource(item)}
              className={
                source === item
                  ? "shrink-0 border-b-2 border-primary pb-3 text-sm text-primary"
                  : "shrink-0 pb-3 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              <FormattedMessage {...messages[sourceLabelKeys[item]]} />
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
          <SourcePreview source={source} />
        </div>
      </div>
    </section>
  );
}

const faqMessageKeys = [
  ["faqWhereQuestion", "faqWhereAnswer"],
  ["faqWhatQuestion", "faqWhatAnswer"],
  ["faqAgentsQuestion", "faqAgentsAnswer"],
  ["faqAuditQuestion", "faqAuditAnswer"],
  ["faqUpdateQuestion", "faqUpdateAnswer"],
  ["faqStudioQuestion", "faqStudioAnswer"],
  ["faqSourcesQuestion", "faqSourcesAnswer"],
  ["faqFitQuestion", "faqFitAnswer"],
  ["faqWhoQuestion", "faqWhoAnswer"],
] as const;

const attachedRows = [
  ["attachedFile", "attachedFileValue"],
  ["attachedClause", "attachedClauseValue"],
  ["attachedStatus", "attachedStatusValue"],
] as const;

const auditFindings = [
  {
    target: "auditFindingDe",
    result: "auditFindingDeFlags",
    flagged: true,
  },
  {
    target: "auditFindingJp",
    result: "auditFindingJpFlags",
    flagged: true,
  },
  {
    target: "auditFindingFr",
    result: "auditFindingFrFlags",
    flagged: false,
  },
] as const;

function DailyAuditSection({ locale }: { locale: AppLocale }) {
  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
          <SectionMeshBackground src={ROSE_MESH_GRADIENT_SRC} className="opacity-75" />
          <div className="relative rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8">
            <div className="flex justify-between gap-3 border-b border-border pb-6 text-sm">
              <b>
                <FormattedMessage {...messages.auditCardTitle} />
              </b>
              <span className="text-primary">
                <FormattedMessage {...messages.auditCardSchedule} />
              </span>
            </div>
            <div className="grid gap-2 pt-5 text-sm sm:grid-cols-[8rem_1fr]">
              <span className="text-muted-foreground">
                <FormattedMessage {...messages.auditChecks} />
              </span>
              <span className="space-y-1">
                <span className="block">
                  <FormattedMessage {...messages.auditCheckProduct} />
                </span>
                <span className="block">
                  <FormattedMessage {...messages.auditCheckWebsite} />
                </span>
              </span>
            </div>
            <div className="grid gap-2 pt-5 text-sm sm:grid-cols-[8rem_1fr]">
              <span className="text-muted-foreground">
                <FormattedMessage {...messages.auditAgainst} />
              </span>
              <span>
                <FormattedMessage {...messages.auditAgainstFile} />
              </span>
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <FormattedMessage {...messages.auditLastRun} />
              </p>
              <div className="mt-3 space-y-3">
                {auditFindings.map((finding) => (
                  <div
                    key={finding.target}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      <FormattedMessage {...messages[finding.target]} />
                    </span>
                    <span className={finding.flagged ? "text-destructive" : "text-primary"}>
                      <FormattedMessage {...messages[finding.result]} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-xl">
          <Eyebrow>
            <FormattedMessage {...messages.auditEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
            <FormattedMessage {...messages.auditHeadline} />
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.auditBody} />
          </p>
          <Link
            href={rewriteAppLocalePath("/product/agents-automation", locale)}
            className="mt-5 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            <FormattedMessage {...messages.exploreAutomations} /> ↗
          </Link>
        </div>
      </div>
    </section>
  );
}

export function GuidelinesPage() {
  const locale = useAppLocale();
  const intl = useIntl();
  const faqItems = faqMessageKeys.map(([question, answer]) => ({
    question: intl.formatMessage(messages[question]),
    answer: intl.formatMessage(messages[answer]),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div>
        <section className="relative isolate mx-auto w-full max-w-6xl overflow-hidden bg-background">
          <KnowledgeWaveGlobe />
          <div className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-5 py-20 text-center sm:px-10 sm:py-24 lg:px-10">
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
                  render={<a href="#guidelines" />}
                >
                  <FormattedMessage {...messages.exploreGuidelines} /> ↓
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="px-3 pb-0 sm:px-6 lg:px-8">
          <GuidelinesPreview />
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 border-b border-border py-7 text-sm text-muted-foreground sm:flex-row">
            <span>
              <FormattedMessage {...messages.fromRulesToDrafts} />
            </span>
            <span className="flex flex-wrap gap-x-7 gap-y-2">
              <span>
                <FormattedMessage {...messages.stepConnect} />
              </span>
              <span>
                <FormattedMessage {...messages.stepRead} />
              </span>
              <span>
                <FormattedMessage {...messages.stepFlag} />
              </span>
              <span>
                <FormattedMessage {...messages.stepShip} />
              </span>
            </span>
          </div>
        </section>

        <GuidelineSources />

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div className="max-w-xl">
              <Eyebrow>
                <FormattedMessage {...messages.appliedEyebrow} />
              </Eyebrow>
              <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
                <FormattedMessage {...messages.appliedHeadline} />
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                <FormattedMessage {...messages.appliedBody} />
              </p>
              <Link
                href={rewriteAppLocalePath("/product/multilingual-content-studio", locale)}
                className="mt-5 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.exploreStudio} /> ↗
              </Link>
            </div>
            <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
              <SectionMeshBackground src={LAVENDER_MESH_GRADIENT_SRC} className="opacity-80" />
              <div className="relative rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8">
                <div className="flex justify-between gap-3 border-b border-border pb-6 text-sm">
                  <b>
                    <FormattedMessage {...messages.campaignGuidelines} />
                  </b>
                  <span className="text-primary">
                    <FormattedMessage {...messages.appliedToDraft} /> ✓
                  </span>
                </div>
                {attachedRows.map(([label, value]) => (
                  <div key={label} className="grid gap-2 pt-5 text-sm sm:grid-cols-[8rem_1fr]">
                    <span className="text-muted-foreground">
                      <FormattedMessage {...messages[label]} />
                    </span>
                    <span>
                      <FormattedMessage {...messages[value]} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <DailyAuditSection locale={locale} />

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
                href={rewriteAppLocalePath("/product/agents-automation", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.automationWorkflow} /> ↗
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
