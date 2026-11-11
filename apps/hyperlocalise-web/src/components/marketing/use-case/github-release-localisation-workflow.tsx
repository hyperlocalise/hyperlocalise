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
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CodeIcon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  GlobeIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = { content: UseCasePageContent };

type Locale = "FR" | "DE" | "JA";

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const meshSources = [
  "/images/mesh/mesh-gradient-1784864073608.jpg",
  "/images/mesh/mesh-gradient-1788785908604.jpg",
  "/images/mesh/mesh-gradient-1784864042890.jpg",
  "/images/mesh/mesh-gradient-1784864145512.jpg",
] as const;

/** Reuse the existing image assets behind each layered, interactive preview. */
function MeshStage({ children, meshIndex }: { children: ReactNode; meshIndex: number }) {
  return (
    <div className="relative isolate flex h-[305px] items-center justify-center overflow-hidden rounded-[1.5rem] border border-border/30 bg-muted/30 p-3 sm:p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url("${meshSources[meshIndex % meshSources.length]}")`,
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/10" />
      <div className="relative z-10 w-full max-w-[320px]">{children}</div>
    </div>
  );
}

function MockPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-background/95 p-3.5 shadow-[0_18px_42px_rgba(35,40,58,0.12)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/75 text-foreground">
      {children}
    </span>
  );
}

function Pill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-5",
        active
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-border/60 bg-background/90 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Check({ muted = false }: { muted?: boolean }) {
  return (
    <CheckCircleIcon
      aria-hidden
      weight={muted ? "regular" : "fill"}
      className={cn("size-4 shrink-0", muted ? "text-muted-foreground/45" : "text-primary")}
    />
  );
}

function PanelHeader({
  icon,
  title,
  trailing,
}: {
  icon: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
        {title}
      </span>
      {trailing}
    </div>
  );
}

/* 01 — The source PR includes actual changed localisation keys. */
function PullRequestPreview() {
  return (
    <MeshStage meshIndex={0}>
      <div className="relative">
        <MockPanel>
          <PanelHeader
            icon={<GitPullRequestIcon className="size-4" aria-hidden />}
            title={<span className="font-mono">GitHub / PR #128</span>}
            trailing={
              <Pill active>
                <Message messageKey="githubReleaseWorkflowPreviewPrOpen" />
              </Pill>
            }
          />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <GitBranchIcon className="size-3.5" aria-hidden />
            <span className="font-mono">feature/billing-ui</span>
            <ArrowRightIcon className="size-3" aria-hidden />
            <span className="font-mono">main</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-muted/25">
            <div className="border-b border-border/50 px-3 py-2 font-mono text-[9px] text-muted-foreground">
              locales/en.json
            </div>
            <div className="space-y-1.5 px-3 py-2.5 font-mono text-[10px]">
              <div className="rounded bg-destructive/10 px-2 py-1 text-destructive/80">
                - &quot;billing.old_plan&quot;
              </div>
              <div className="rounded bg-primary/10 px-2 py-1 text-primary">
                + &quot;billing.plan_name&quot;
              </div>
              <div className="rounded bg-primary/10 px-2 py-1 text-primary">
                + &quot;billing.change_plan&quot;
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <Pill>
              <Message messageKey="githubReleaseWorkflowPreviewPrChanges" />
            </Pill>
            <span className="flex items-center gap-1 text-[10px] text-primary">
              <Check />
            </span>
          </div>
        </MockPanel>
        <div className="absolute -bottom-3 -right-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-[10px] font-medium shadow-lg sm:-right-3">
          <span className="flex items-center gap-1.5">
            <CheckCircleIcon className="size-3.5 text-primary" weight="fill" aria-hidden />
            <Message messageKey="githubReleaseWorkflowPreviewPrDetected" />
          </span>
        </div>
      </div>
    </MeshStage>
  );
}

/* 02 — Changed keys are mapped to locale and glossary impact. */
function ChangeAnalysisPreview() {
  return (
    <MeshStage meshIndex={1}>
      <div className="relative">
        <MockPanel>
          <PanelHeader
            icon={<CodeIcon className="size-4" aria-hidden />}
            title={<Message messageKey="githubReleaseWorkflowPreviewAnalysisTitle" />}
            trailing={<Pill active>+6 / ~14</Pill>}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                <Message messageKey="githubReleaseWorkflowPreviewAffectedLocales" />
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight">04</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
              <p className="text-[10px] text-muted-foreground">
                <Message messageKey="githubReleaseWorkflowPreviewGlossaryImpact" />
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-foreground">
                <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
                <Message messageKey="githubReleaseWorkflowPreviewReviewNeeded" />
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-background/90 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-foreground">billing.plan_name</span>
              <Pill>FR · DE · JA</Pill>
            </div>
            <div className="h-px bg-border/60" />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-foreground">billing.change_plan</span>
              <Pill active>
                <Message messageKey="githubReleaseWorkflowPreviewNewKey" />
              </Pill>
            </div>
          </div>
        </MockPanel>
        <div className="absolute -bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-[10px] shadow-lg">
          <GlobeIcon className="size-3.5 text-primary" aria-hidden />
          FR · DE · JA · ES
        </div>
      </div>
    </MeshStage>
  );
}

const translatedSamples: Record<Locale, UseCaseMessageKey> = {
  FR: "githubReleaseWorkflowPreviewFrenchText",
  DE: "githubReleaseWorkflowPreviewGermanText",
  JA: "githubReleaseWorkflowPreviewJapaneseText",
};

/* 03 — Functional locale tabs, with translatable example draft strings. */
function TranslationDraftPreview() {
  const [locale, setLocale] = useState<Locale>("FR");
  const intl = useIntl();

  return (
    <MeshStage meshIndex={2}>
      <div className="relative">
        <MockPanel>
          <PanelHeader
            icon={<SparkleIcon className="size-4" aria-hidden />}
            title={<Message messageKey="githubReleaseWorkflowPreviewDraftTitle" />}
            trailing={
              <Pill active>
                <Message messageKey="githubReleaseWorkflowPreviewDraftReady" />
              </Pill>
            }
          />
          <div
            className="flex gap-1.5"
            role="group"
            aria-label={intl.formatMessage(
              useCasePageMessages.githubReleaseWorkflowPreviewSelectLocale,
            )}
          >
            {(["FR", "DE", "JA"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={locale === item}
                onClick={() => setLocale(item)}
                className={cn(
                  "rounded-lg border px-3 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  locale === item
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted/40",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                <Message messageKey="githubReleaseWorkflowPreviewSourceLabel" />
              </p>
              <p className="mt-1 text-[11px] text-foreground">
                <Message messageKey="githubReleaseWorkflowPreviewSourceText" />
              </p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-medium uppercase tracking-wide text-primary">
                  <Message messageKey="githubReleaseWorkflowPreviewLocalisedLabel" /> · {locale}
                </p>
                <SparkleIcon className="size-3.5 text-primary" aria-hidden />
              </div>
              <p className="mt-1 text-[11px] font-medium text-foreground">
                <Message messageKey={translatedSamples[locale]} />
              </p>
            </div>
          </div>
        </MockPanel>
      </div>
    </MeshStage>
  );
}

const reviewers = [
  { locale: "FR", status: "githubReleaseWorkflowPreviewApproved" },
  { locale: "DE", status: "githubReleaseWorkflowPreviewInReview" },
  { locale: "JA", status: "githubReleaseWorkflowPreviewWaiting" },
] as const;

/* 04 — Review queue has selectable locale rows, not generic skeleton lines. */
function ReviewRoutingPreview() {
  const [selected, setSelected] = useState<Locale>("DE");

  return (
    <MeshStage meshIndex={3}>
      <MockPanel>
        <PanelHeader
          icon={<UsersIcon className="size-4" aria-hidden />}
          title={<Message messageKey="githubReleaseWorkflowPreviewReviewTitle" />}
          trailing={<Pill>Lokalise</Pill>}
        />
        <div className="space-y-2">
          {reviewers.map(({ locale, status }) => (
            <button
              key={locale}
              type="button"
              onClick={() => setSelected(locale)}
              aria-pressed={selected === locale}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected === locale
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/60 bg-background hover:bg-muted/40",
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-muted/70 font-mono text-[10px] font-semibold">
                {locale}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold text-foreground">{locale}</span>
                <span className="block text-[10px] text-muted-foreground">
                  <Message messageKey={status} />
                </span>
              </span>
              <Check muted={locale !== "FR"} />
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/45 px-2.5 py-2 text-[10px] text-muted-foreground">
          <UsersIcon className="size-3.5 text-primary" aria-hidden />
          <Message messageKey="githubReleaseWorkflowPreviewReviewerAssigned" />
          <span className="ml-auto font-mono font-semibold text-foreground">{selected}</span>
        </div>
      </MockPanel>
    </MeshStage>
  );
}

const checks = [
  "githubReleaseWorkflowPreviewCoverageCheck",
  "githubReleaseWorkflowPreviewGlossaryCheck",
  "githubReleaseWorkflowPreviewRegressionCheck",
] as const;

/* 05 — A functional example CI check, without suggesting a real workflow run. */
function CiCheckPreview() {
  const [complete, setComplete] = useState(false);

  return (
    <MeshStage meshIndex={4}>
      <MockPanel>
        <PanelHeader
          icon={<ShieldCheckIcon className="size-4" aria-hidden />}
          title={<span className="font-mono">GitHub Actions / i18n</span>}
          trailing={
            <Pill active={complete}>
              <Message
                messageKey={
                  complete
                    ? "githubReleaseWorkflowPreviewPassed"
                    : "githubReleaseWorkflowPreviewChecksPending"
                }
              />
            </Pill>
          }
        />
        <div className="space-y-2.5 rounded-xl border border-border/60 p-3">
          {checks.map((key, index) => (
            <div key={key} className="flex items-center gap-2.5 text-[10px]">
              {index === 2 && !complete ? (
                <CircleNotchIcon className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Check />
              )}
              <span className="min-w-0 flex-1 text-foreground">
                <Message messageKey={key} />
              </span>
            </div>
          ))}
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-all",
                complete ? "w-full" : "w-2/3",
              )}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setComplete((value) => !value)}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowsClockwiseIcon className="size-3.5" aria-hidden />
          <Message
            messageKey={
              complete
                ? "githubReleaseWorkflowPreviewResetChecks"
                : "githubReleaseWorkflowPreviewRunChecks"
            }
          />
        </button>
      </MockPanel>
    </MeshStage>
  );
}

/* 06 — Illustrates a blocked gate becoming eligible after review. */
function ReleaseGatePreview() {
  const [approved, setApproved] = useState(false);

  return (
    <MeshStage meshIndex={5}>
      <div className="relative">
        <MockPanel>
          <PanelHeader
            icon={<GitMergeIcon className="size-4" aria-hidden />}
            title={<Message messageKey="githubReleaseWorkflowPreviewGateTitle" />}
            trailing={
              approved ? (
                <Check />
              ) : (
                <WarningCircleIcon className="size-4 text-amber-600" aria-hidden />
              )
            }
          />
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-3",
              approved ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5",
            )}
          >
            {approved ? (
              <CheckCircleIcon className="size-5 shrink-0 text-primary" weight="fill" aria-hidden />
            ) : (
              <WarningCircleIcon className="size-5 shrink-0 text-amber-600" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                <Message
                  messageKey={
                    approved
                      ? "githubReleaseWorkflowPreviewGateReady"
                      : "githubReleaseWorkflowPreviewGateBlocked"
                  }
                />
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                <Message
                  messageKey={
                    approved
                      ? "githubReleaseWorkflowPreviewAllLocalesApproved"
                      : "githubReleaseWorkflowPreviewAwaitingLocales"
                  }
                />
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-[10px]">
            <span className="flex items-center gap-1.5 font-mono">
              <GitBranchIcon className="size-3.5 text-muted-foreground" aria-hidden />
              PR #128
            </span>
            <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="flex items-center gap-1 font-mono">
              main <GlobeIcon className="size-3.5 text-primary" aria-hidden />
            </span>
          </div>
          <button
            type="button"
            onClick={() => setApproved((value) => !value)}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              approved
                ? "border border-border/70 bg-background text-foreground hover:bg-muted/40"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {approved ? (
              <ArrowsClockwiseIcon className="size-3.5" aria-hidden />
            ) : (
              <CheckCircleIcon className="size-3.5" aria-hidden />
            )}
            <Message
              messageKey={
                approved
                  ? "githubReleaseWorkflowPreviewResetGate"
                  : "githubReleaseWorkflowPreviewPreviewApproval"
              }
            />
          </button>
        </MockPanel>
      </div>
    </MeshStage>
  );
}

const previews = [
  <PullRequestPreview key="pr" />,
  <ChangeAnalysisPreview key="analysis" />,
  <TranslationDraftPreview key="draft" />,
  <ReviewRoutingPreview key="review" />,
  <CiCheckPreview key="ci" />,
  <ReleaseGatePreview key="gate" />,
];

export function GithubReleaseLocalisationWorkflowSection({ content }: Props) {
  return (
    <section className="mx-auto w-full max-w-[1280px]">
      <div className="max-w-3xl">
        <TypographyP className="text-sm font-medium" tone="subtle">
          <Message messageKey={content.workflow.labelKey} />
        </TypographyP>
        <TypographyH2 className="mt-4 max-w-[720px] text-4xl leading-[1.08] tracking-[-0.05em] sm:text-5xl">
          <Message messageKey={content.workflow.titleKey} />
        </TypographyH2>
        <TypographyP className="mt-5 max-w-[650px] text-base leading-8" tone="subtle">
          <Message messageKey={content.workflow.descriptionKey} />
        </TypographyP>
      </div>

      <div className="mt-12 grid gap-x-5 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {content.workflow.steps.map((step, index) => (
          <article key={step.labelKey} className="min-w-0">
            {previews[index]}

            <div className="mt-5 px-1">
              <TypographyH3 className="text-[1.7rem] leading-tight tracking-[-0.04em]">
                <Message messageKey={step.labelKey} />
              </TypographyH3>
              {step.descriptionKey ? (
                <TypographyP className="mt-2 text-sm leading-6" tone="subtle">
                  <Message messageKey={step.descriptionKey} />
                </TypographyP>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
