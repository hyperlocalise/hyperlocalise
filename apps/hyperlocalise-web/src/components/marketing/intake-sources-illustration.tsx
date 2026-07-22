"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage } from "react-intl";

import {
  TypographyH2,
  TypographyH4,
  TypographyMuted,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";

import { intakeSourcesIllustrationMessages } from "./intake-sources-illustration.messages";

const GITHUB_BRAND = "GitHub";
const SLACK_BRAND = "Slack";
const ANTHROPIC_BRAND = "Anthropic";
const CLAUDE_CLI = "claude";
const SLACK_CHANNEL = "#launch-ops";
const LOCALE_FR = "fr-FR";
const LOCALE_DE = "de-DE";
const CHANGED_FILES = [
  "messages/en/pricing.json",
  "docs/launch-checklist.mdx",
  "locales/fr-FR/hero.json",
] as const;
const MCP_COMMAND_LINES = [
  "mcp add --transport http hyperlocalise",
  "https://hyperlocalise.com/mcp",
] as const;

function DetailPill({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light" | "slack";
}) {
  return (
    <span
      className={
        tone === "light"
          ? "inline-flex items-center rounded-full border border-background/16 bg-background/12 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-background/78"
          : tone === "slack"
            ? "inline-flex items-center rounded-full border border-slate-300/80 bg-white/95 px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-slate-700"
            : "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 font-sans text-[0.68rem] font-medium tracking-[0.08em] uppercase text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

function GithubSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-background/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_88%,var(--background)_12%)_0%,color-mix(in_srgb,var(--foreground)_94%,var(--background)_6%)_100%)] p-5 text-background shadow-[0_28px_80px_color-mix(in_srgb,var(--foreground)_18%,transparent)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[2.4rem] leading-none tracking-[-0.07em] text-background sm:text-[2.7rem] lg:text-[3rem]">
          {GITHUB_BRAND}
        </TypographyH2>
        <TypographySmall className="rounded-full border border-background/16 bg-background/10 px-3 py-1 text-[0.7rem] tracking-widest uppercase text-background/74">
          <FormattedMessage {...intakeSourcesIllustrationMessages.githubBadge} />
        </TypographySmall>
      </div>

      <div className="mt-8 rounded-[1.2rem] border border-background/8 bg-muted0 p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--background)_3%,transparent)] mask-radial-from-35% mask-radial-at-left sm:mt-10 sm:rounded-[1.35rem] sm:p-5 lg:mt-14 lg:rounded-[1.45rem] lg:p-6">
        <TypographySmall className="text-[0.72rem] tracking-[0.18em] uppercase text-background/58">
          <FormattedMessage {...intakeSourcesIllustrationMessages.changedFiles} />
        </TypographySmall>
        <div className="mt-4 space-y-3 font-mono text-[0.84rem] leading-6 text-background/92 sm:mt-5 sm:text-[0.9rem] sm:leading-7 lg:text-[0.94rem]">
          {CHANGED_FILES.map((filePath) => (
            <div key={filePath}>{filePath}</div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <DetailPill tone="light">
            <FormattedMessage {...intakeSourcesIllustrationMessages.localeUpdatesPill} />
          </DetailPill>
          <DetailPill tone="light">
            <FormattedMessage {...intakeSourcesIllustrationMessages.driftReadyPill} />
          </DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-background sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.githubCardTitle} />
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-background/62 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.githubCardBody} />
        </TypographyP>
      </div>
    </article>
  );
}

function SlackSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-[#e9e0fb] bg-[linear-gradient(180deg,#faf8ff_0%,#f2edff_100%)] p-5 text-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.12)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <div className="flex items-start justify-between gap-4">
        <TypographyH2 className="pb-0 text-[2.4rem] leading-none tracking-[-0.07em] text-slate-950 sm:text-[2.7rem] lg:text-[3rem]">
          {SLACK_BRAND}
        </TypographyH2>
        <TypographySmall className="inline-flex w-fit items-center rounded-full border border-slate-400/70 bg-slate-900/78 px-3 py-1 text-[0.68rem] tracking-[0.18em] uppercase text-subtle-foreground">
          <FormattedMessage {...intakeSourcesIllustrationMessages.slackBadge} />
        </TypographySmall>
      </div>

      <div className="mt-8 rounded-[1.2rem] border border-[#d9d4e5] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(242,239,248,0.94)_100%)] p-4 shadow-[0_18px_40px_rgba(88,72,116,0.16)] mask-radial-from-35% mask-radial-at-left sm:mt-10 sm:rounded-[1.35rem] sm:p-5 lg:mt-14 lg:rounded-[1.45rem] lg:p-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-[#4a154b] p-2 sm:size-9 sm:rounded-2xl">
            <div className="grid h-full w-full grid-cols-2 gap-1">
              <span className="rounded-full bg-[#36c5f0]" />
              <span className="rounded-full bg-[#2eb67d]" />
              <span className="rounded-full bg-[#ecb22e]" />
              <span className="rounded-full bg-[#e01e5a]" />
            </div>
          </div>
          <div>
            <TypographySmall className="text-slate-900">{SLACK_CHANNEL}</TypographySmall>
            <TypographyMuted className="text-sm text-slate-500">
              <FormattedMessage {...intakeSourcesIllustrationMessages.slackNewRequest} />
            </TypographyMuted>
          </div>
        </div>

        <TypographyP className="mt-5 max-w-60 text-[0.94rem] leading-6 text-slate-700 sm:mt-6 sm:max-w-[16rem] sm:text-[0.98rem] sm:leading-7 lg:max-w-68 lg:text-[1.02rem] lg:leading-8">
          <FormattedMessage {...intakeSourcesIllustrationMessages.slackMessage} />
        </TypographyP>

        <div className="mt-4 flex flex-wrap gap-2">
          <DetailPill tone="slack">{LOCALE_FR}</DetailPill>
          <DetailPill tone="slack">{LOCALE_DE}</DetailPill>
          <DetailPill tone="slack">
            <FormattedMessage {...intakeSourcesIllustrationMessages.launchCopyPill} />
          </DetailPill>
        </div>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-slate-950 sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.slackCardTitle} />
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-slate-700/60 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.slackCardBody} />
        </TypographyP>
      </div>
    </article>
  );
}

function ClaudeSourceCard() {
  return (
    <article className="relative flex min-h-90 flex-col overflow-hidden rounded-[1.35rem] border border-clay-500 bg-[linear-gradient(180deg,var(--color-flame-500)_0%,var(--color-flame-700)_100%)] p-5 text-background shadow-[0_28px_80px_color-mix(in_srgb,var(--foreground)_14%,transparent)] sm:min-h-100 sm:rounded-[1.55rem] sm:p-6 lg:min-h-116 lg:rounded-[1.7rem]">
      <TypographyH2 className="relative pb-0 text-[2.85rem] leading-none tracking-[-0.08em] text-background sm:text-[3.2rem] lg:text-[3.6rem]">
        {ANTHROPIC_BRAND}
      </TypographyH2>

      <div className="mt-10 rounded-[1.25rem] border border-background/14 bg-background/6 p-4 shadow-[0_20px_40px_color-mix(in_srgb,var(--foreground)_10%,transparent)] mask-radial-from-35% mask-radial-at-left sm:mt-12 sm:rounded-[1.4rem] sm:p-5 lg:mt-18 lg:rounded-[1.55rem] lg:p-6">
        <TypographyP className="font-mono text-[1rem] leading-8 text-background/96">
          {CLAUDE_CLI}
        </TypographyP>
        <TypographyP className="mt-6 max-w-56 font-mono text-[0.9rem] leading-6 text-background/96 sm:mt-7 sm:max-w-96 sm:text-[0.95rem] sm:leading-7 lg:mt-8 lg:text-[1rem] lg:leading-8 overflow-hidden">
          {MCP_COMMAND_LINES[0]}
          <br />
          {MCP_COMMAND_LINES[1]}
        </TypographyP>
      </div>

      <div className="mt-auto pt-7 sm:pt-8 lg:pt-10">
        <TypographyH4 className="max-w-56 text-[1.6rem] leading-[1.04] tracking-[-0.06em] text-background sm:max-w-60 sm:text-[1.8rem] lg:max-w-64 lg:text-[2rem] lg:leading-[1.02]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.claudeCardTitle} />
        </TypographyH4>
        <TypographyP className="mt-2.5 max-w-56 text-[0.95rem] leading-6 text-background/66 sm:mt-3 sm:max-w-60 sm:text-[0.98rem] sm:leading-7 lg:max-w-64 lg:text-[1rem]">
          <FormattedMessage {...intakeSourcesIllustrationMessages.claudeCardBody} />
        </TypographyP>
      </div>
    </article>
  );
}

export function IntakeSourcesIllustration() {
  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <TypographySmall>
          <FormattedMessage {...intakeSourcesIllustrationMessages.sourcesLabel} />
        </TypographySmall>
        <TypographyMuted className="text-sm">
          <FormattedMessage {...intakeSourcesIllustrationMessages.sourcesSummary} />
        </TypographyMuted>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GithubSourceCard />
        <SlackSourceCard />
        <ClaudeSourceCard />
      </div>
    </section>
  );
}
