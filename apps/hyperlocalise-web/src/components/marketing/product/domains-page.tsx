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
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  DUSK_MESH_GRADIENT_SRC,
  ROSE_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
  SEAFOAM_MESH_GRADIENT_SRC,
  SectionMeshBackground,
  MeshStage,
} from "@/components/marketing/hero-frame-mesh-stage";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";

import { DomainsAuditDashboard, DomainsMockUI, type DomainsAuditFocus } from "./domains-mock-ui";
import { domainsPageMessages as messages } from "./domains-page.messages";

const solutionIds = ["localisation", "seo", "aeo"] as const satisfies readonly DomainsAuditFocus[];

const solutionLabelKeys = {
  localisation: "solutionLocalisation",
  seo: "solutionSeo",
  aeo: "solutionAeo",
} as const;

const solutionCopyKeys = {
  localisation: {
    title: "localisationTitle",
    body: "localisationBody",
    link: "localisationLink",
  },
  seo: {
    title: "seoTitle",
    body: "seoBody",
    link: "seoLink",
  },
  aeo: {
    title: "aeoTitle",
    body: "aeoBody",
    link: "aeoLink",
  },
} as const;

const faqMessageKeys = [
  ["faqWhatQuestion", "faqWhatAnswer"],
  ["faqLocalisationQuestion", "faqLocalisationAnswer"],
  ["faqSeoQuestion", "faqSeoAnswer"],
  ["faqAeoQuestion", "faqAeoAnswer"],
  ["faqReplaceQuestion", "faqReplaceAnswer"],
  ["faqFitQuestion", "faqFitAnswer"],
  ["faqWhoQuestion", "faqWhoAnswer"],
  ["faqStartQuestion", "faqStartAnswer"],
] as const;

type PreviewLanguage = "en" | "fr-FR" | "de-DE";
type AuditIssue = "hreflang" | "meta" | "faq";

const previewLanguages: Array<{
  id: PreviewLanguage;
  name: "languageEnglish" | "languageFrench" | "languageGerman";
  path: string;
}> = [
  { id: "en", name: "languageEnglish", path: "en" },
  { id: "fr-FR", name: "languageFrench", path: "fr-FR" },
  { id: "de-DE", name: "languageGerman", path: "de-DE" },
];

const articleCopy = {
  en: { title: "articleTitleEn", intro: "articleIntroEn" },
  "fr-FR": { title: "articleTitleFr", intro: "articleIntroFr" },
  "de-DE": { title: "articleTitleDe", intro: "articleIntroDe" },
} as const;

const issues: Array<{
  id: AuditIssue;
  language: PreviewLanguage;
  label: "issueHreflang" | "issueMeta" | "issueFaq";
  highlight: "highlightHreflang" | "highlightMeta" | "highlightFaq";
}> = [
  {
    id: "hreflang",
    language: "fr-FR",
    label: "issueHreflang",
    highlight: "highlightHreflang",
  },
  {
    id: "meta",
    language: "de-DE",
    label: "issueMeta",
    highlight: "highlightMeta",
  },
  {
    id: "faq",
    language: "en",
    label: "issueFaq",
    highlight: "highlightFaq",
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

function DomainsPreview() {
  return (
    <div id="domains" className="mx-auto max-w-6xl">
      <MeshStage
        className="w-full"
        contentClassName="px-3 pt-3 pb-0 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10"
        meshSrc={SEAFOAM_MESH_GRADIENT_SRC}
        priority
      >
        <DomainsMockUI
          priority
          showMesh={false}
          className="rounded-t-xl rounded-b-none border-0 shadow-2xl shadow-[#172541]/20"
        />
      </MeshStage>
    </div>
  );
}

function DomainsSolutions() {
  const intl = useIntl();
  const [solution, setSolution] = useState<DomainsAuditFocus>("localisation");
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
              onClick={() => setSolution(item)}
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
          <div className="relative isolate flex min-h-80 flex-1 items-center overflow-hidden p-4 sm:p-6">
            <SectionMeshBackground
              src={
                solution === "seo"
                  ? ROSE_MESH_GRADIENT_SRC
                  : solution === "aeo"
                    ? SAGE_MESH_GRADIENT_SRC
                    : SEAFOAM_MESH_GRADIENT_SRC
              }
              className="opacity-80"
            />
            <div className="relative w-full">
              <DomainsAuditDashboard focus={solution} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveSiteSection() {
  const intl = useIntl();
  const [language, setLanguage] = useState<PreviewLanguage>("en");
  const [issue, setIssue] = useState<AuditIssue>("hreflang");
  const article = articleCopy[language];
  const activeIssue = issues.find((item) => item.id === issue)!;
  const highlightOnPage = activeIssue.language === language;

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 sm:gap-12">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>
            <FormattedMessage {...messages.liveEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 text-balance font-heading text-4xl leading-tight sm:text-5xl">
            <FormattedMessage {...messages.liveHeadline} />
          </h2>
          <p className="mt-6 text-pretty text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.liveBody} />
          </p>
        </div>
        <figure className="relative isolate min-w-0 overflow-hidden rounded-xl p-4 sm:p-8 lg:p-12">
          <SectionMeshBackground src={SEAFOAM_MESH_GRADIENT_SRC} className="opacity-80" />
          <figcaption className="relative mb-3 text-center text-xs text-foreground">
            <FormattedMessage {...messages.liveCaption} />
          </figcaption>
          <div className="relative mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 px-5 py-4 text-xs">
                <span className="min-w-0 break-all text-muted-foreground">
                  daylight.example.com/{previewLanguages.find((item) => item.id === language)?.path}
                  /journal/a-different-light
                </span>
                <span className="inline-flex items-center gap-2 font-medium text-primary">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  <FormattedMessage {...messages.liveStatus} />
                </span>
              </div>
              <div className="p-5 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                  <span className="font-heading text-xl">Daylight</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FormattedMessage {...messages.languageLabel} />
                    <select
                      value={language}
                      onChange={(event) => {
                        const value = previewLanguages.find(
                          (item) => item.id === event.target.value,
                        )?.id;
                        if (value) {
                          setLanguage(value);
                        }
                      }}
                      className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {previewLanguages.map((item) => (
                        <option key={item.id} value={item.id}>
                          {intl.formatMessage(messages[item.name])}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <article lang={language} className="mx-auto max-w-3xl py-8" aria-live="polite">
                  <p className="text-xs font-medium text-primary">
                    <FormattedMessage {...messages.articleCategory} />
                  </p>
                  <h3
                    className={cn(
                      "mt-4 max-w-2xl text-balance font-heading text-3xl leading-tight sm:text-5xl",
                      highlightOnPage &&
                        issue === "meta" &&
                        "rounded-md ring-2 ring-destructive/50",
                    )}
                  >
                    <FormattedMessage {...messages[article.title]} />
                  </h3>
                  <p
                    className={cn(
                      "mt-5 text-pretty text-sm leading-7 text-muted-foreground",
                      highlightOnPage &&
                        issue === "hreflang" &&
                        "rounded-md bg-destructive/10 p-3 text-destructive",
                    )}
                  >
                    {highlightOnPage && issue === "hreflang" ? (
                      <FormattedMessage {...messages.highlightHreflang} />
                    ) : highlightOnPage && issue === "meta" ? (
                      <FormattedMessage {...messages.highlightMeta} />
                    ) : (
                      <FormattedMessage {...messages[article.intro]} />
                    )}
                  </p>
                  {highlightOnPage && issue === "faq" ? (
                    <p className="mt-5 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <FormattedMessage {...messages.highlightFaq} />
                    </p>
                  ) : null}
                  <figure className="mt-6">
                    <Image
                      src="/images/nasa-Q1p7bh3SHj8-unsplash.jpg"
                      alt={intl.formatMessage(messages[article.title])}
                      width={4256}
                      height={2832}
                      sizes="(min-width: 1024px) 768px, (min-width: 640px) 80vw, 90vw"
                      className="aspect-[2/1] w-full rounded-lg object-cover"
                    />
                  </figure>
                </article>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 text-card-foreground">
              <p className="text-sm font-semibold">
                <FormattedMessage {...messages.issuesHeading} />
              </p>
              <ul className="mt-4 space-y-2">
                {issues.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setIssue(item.id);
                        setLanguage(item.language);
                      }}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-xs leading-5",
                        issue === item.id
                          ? "border border-destructive/25 bg-destructive/10 text-destructive"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <FormattedMessage {...messages[item.label]} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

function SearchSnippetSection() {
  const [market, setMarket] = useState<PreviewLanguage>("en");
  const article = articleCopy[market];
  const missing = market === "de-DE";

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
        <div className="max-w-xl">
          <Eyebrow>
            <FormattedMessage {...messages.searchEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
            <FormattedMessage {...messages.searchHeadline} />
          </h2>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.searchBody} />
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {previewLanguages.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMarket(item.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  market === item.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <FormattedMessage {...messages[item.name]} />
              </button>
            ))}
          </div>
        </div>
        <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
          <SectionMeshBackground src={SAGE_MESH_GRADIENT_SRC} className="opacity-80" />
          <div className="relative rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8">
            <p className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.searchUrl} />
            </p>
            <p className="mt-2 text-lg text-[#1a0dab] dark:text-primary">
              <FormattedMessage {...messages[article.title]} />
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {missing ? (
                <span className="text-destructive">
                  <FormattedMessage {...messages.searchMissing} />
                </span>
              ) : (
                <FormattedMessage {...messages[article.intro]} />
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DomainsPage() {
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
                render={<a href="#domains" />}
              >
                <FormattedMessage {...messages.exploreDomains} /> ↓
              </Button>
            </div>
          </div>
        </section>

        <section className="px-3 pb-0 sm:px-6 lg:px-8">
          <DomainsPreview />
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 border-b border-border py-7 text-sm text-muted-foreground sm:flex-row">
            <span>
              <FormattedMessage {...messages.fromPublishToFound} />
            </span>
            <span className="flex flex-wrap gap-x-7 gap-y-2">
              <span>
                <FormattedMessage {...messages.stepPublish} />
              </span>
              <span>
                <FormattedMessage {...messages.stepLanguages} />
              </span>
              <span>
                <FormattedMessage {...messages.stepSearch} />
              </span>
              <span>
                <FormattedMessage {...messages.stepFound} />
              </span>
            </span>
          </div>
        </section>

        <DomainsSolutions />
        <LiveSiteSection />
        <SearchSnippetSection />

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
                href={rewriteAppLocalePath("/product/hyperlab", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.hyperlab} /> ↗
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
