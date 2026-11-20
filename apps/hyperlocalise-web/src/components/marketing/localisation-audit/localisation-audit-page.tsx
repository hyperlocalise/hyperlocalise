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
import { CheckCircleIcon } from "@phosphor-icons/react/ssr";

import { MeshStage, SAGE_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import type { LocalisationAuditLeaderboardEntry } from "@/lib/localisation-audit/store";
import { describeLocalisationAuditScoringModel } from "@/lib/localisation-audit/score-composition";
import { scoreTone } from "@/lib/localisation-audit/score-tone";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";

import { getLocalisationAuditFaqItems } from "./localisation-audit-faq-content";
import { LocalisationAuditForm } from "./localisation-audit-form";
import { LocalisationAuditLeaderboard } from "./localisation-audit-leaderboard";
import {
  getLocalisationAuditPageCopy,
  type LocalisationAuditPageCopy,
} from "./localisation-audit-page-content";
import { MeterBar, ScoreRing } from "./localisation-audit-score-visuals";
import { LocalisationAuditScoringExplainer } from "./localisation-audit-scoring-explainer";

/** Illustrative numbers for the hero preview card; not a real audit. */
const EXAMPLE_SCORE = 72;
const EXAMPLE_DIMENSION_SCORES = [84, 66, 79, 58] as const;

type LocalisationAuditPageProps = {
  locale: string;
  leaderboard: LocalisationAuditLeaderboardEntry[];
};

function ExampleReportCard({ copy }: { copy: LocalisationAuditPageCopy }) {
  return (
    <MeshStage meshSrc={SAGE_MESH_GRADIENT_SRC} contentClassName="p-6 sm:p-10" priority>
      <div
        className="rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl sm:p-6"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">{copy.exampleReportSite}</p>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            {copy.exampleReportLabel}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-6">
          <ScoreRing
            score={EXAMPLE_SCORE}
            label={copy.exampleReportLabel}
            className="size-32 sm:size-32"
          />
          <ul className="min-w-0 flex-1 space-y-3">
            {copy.notices.map((notice, index) => {
              const score = EXAMPLE_DIMENSION_SCORES[index] ?? 0;
              return (
                <li key={notice.title}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{notice.title}</span>
                    <span className="font-semibold tabular-nums">{score}</span>
                  </div>
                  <MeterBar
                    value={score}
                    tone={scoreTone(score)}
                    delay={0.2 + index * 0.1}
                    className="mt-1 h-1.5"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </MeshStage>
  );
}

export function LocalisationAuditPage({ locale, leaderboard }: LocalisationAuditPageProps) {
  const copy = getLocalisationAuditPageCopy(locale);
  const faqItems = getLocalisationAuditFaqItems(locale);
  const model = describeLocalisationAuditScoringModel();
  const facts = [
    copy.heroFactSpeed,
    copy.heroFactScope,
    copy.heroFactChecks({ checks: model.totalChecks }),
  ];
  const faqs = faqItems.map((item) => {
    if (item.question === copy.faqBlockedQuestion) {
      return {
        question: item.question,
        answer: (
          <>
            <p>{copy.crawlAccessNoteBody}</p>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>{copy.crawlAccessNoteUserAgent}:</span>
              <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                {LOCALISATION_AUDIT_USER_AGENT}
              </code>
            </p>
          </>
        ),
      };
    }
    if (item.question === copy.faqFindingQuestion) {
      return {
        question: item.question,
        answer: (
          <p className="rounded-lg border-s-2 border-border bg-muted/40 p-3 text-foreground">
            {item.answer}
          </p>
        ),
      };
    }
    return { question: item.question, answer: <p>{item.answer}</p> };
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid items-center gap-12 px-5 pt-16 pb-20 sm:px-8 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:px-10">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {copy.heroEyebrow}
            </p>
            <TypographyH1 className="mt-3">{copy.headline}</TypographyH1>
            <TypographyP className="mt-5 max-w-2xl sm:text-xl" size="large" tone="subtle">
              {copy.subcopy}
            </TypographyP>
            <div className="mt-8">
              <LocalisationAuditForm locale={locale} />
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {facts.map((fact) => (
                <li key={fact} className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="size-4 text-success" weight="fill" aria-hidden />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <ExampleReportCard copy={copy} />
        </section>

        <LocalisationAuditScoringExplainer copy={copy} />

        <LocalisationAuditLeaderboard locale={locale} entries={leaderboard} />

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <TypographyH2 className="pb-0">{copy.faqHeading}</TypographyH2>
            <Accordion>
              {faqs.map((faq) => (
                <AccordionItem key={faq.question} value={faq.question}>
                  <AccordionTrigger className="text-base">{faq.question}</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <MarketingFooter columns={footerColumns} />
      </div>
    </div>
  );
}
