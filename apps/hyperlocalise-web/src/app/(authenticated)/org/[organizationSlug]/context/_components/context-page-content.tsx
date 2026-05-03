"use client";

import { createElement } from "react";
import {
  ArrowDown01Icon,
  File01Icon,
  FileValidationIcon,
  NoteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  MetricsGrid,
  PageHeader,
  ResourceCard,
  toneClass,
} from "../../_components/workspace-resource-shared";

const contextMetrics = [
  { label: "Context files", value: "6", detail: "4 active", tone: "info" },
  { label: "Markdown blocks", value: "38", detail: "ready for agent", tone: "safe" },
  { label: "Stale sections", value: "2", detail: "needs refresh", tone: "watch" },
] as const;

const contextEntries = [
  {
    title: "Brand voice",
    source: "Workspace default",
    updated: "14m ago",
    status: "Active",
    tone: "safe",
    markdown: `# Brand voice

## Principles
- Use direct, practical language.
- Keep product terminology consistent across locales.
- Prefer short sentences for onboarding and error states.

## Avoid
- Marketing claims that imply full automation.
- Locale-specific idioms in source strings.
- Changing product names unless a glossary entry requires it.`,
  },
  {
    title: "Product surface notes",
    source: "GitHub docs",
    updated: "47m ago",
    status: "Active",
    tone: "safe",
    markdown: `# Product surface notes

## Navigation
- Workspace pages use Analytics, Projects, Jobs, and Context.
- Manage pages own Agent, Glossaries, Translation Memories, Integrations, and Settings.

## Translation guidance
- Preserve placeholders, ICU syntax, and markdown structure.
- Keep CTA labels concise in every locale.`,
  },
  {
    title: "Release context",
    source: "Inbox request",
    updated: "2h ago",
    status: "Review",
    tone: "watch",
    markdown: `# Release context

## Upcoming changes
- New email agent setup copy is shipping this week.
- Provider configuration remains workspace-level.

## Reviewer notes
- Confirm billing terminology before translating pricing copy.
- Recheck Japanese screenshots once strings are imported.`,
  },
  {
    title: "Legal constraints",
    source: "Legal glossary",
    updated: "1d ago",
    status: "Pinned",
    tone: "info",
    markdown: `# Legal constraints

## Required treatment
- Do not paraphrase liability disclaimers.
- Keep dates, currencies, and plan names unchanged unless localization rules require formatting.

## Escalation
- Flag policy, privacy, and billing strings for reviewer approval.`,
  },
] as const;

function MarkdownBlock({ markdown }: { markdown: string }) {
  return createElement(
    "code",
    {
      className:
        "block max-h-96 overflow-auto rounded-lg border border-white/8 bg-white/[0.035] px-4 py-4 font-mono text-xs leading-6 whitespace-pre-wrap text-white/72",
    },
    markdown,
  );
}

export function ContextPageContent() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={File01Icon}
        label="Workspace"
        title="Context"
        description="Review workspace context that guides agent runs, translation decisions, and reviewer handoffs."
        statusLabel="Mock markdown"
      />

      <MetricsGrid metrics={contextMetrics} />

      <ResourceCard
        title="Context content"
        description="Mock workspace context stored as markdown and grouped by source."
        icon={FileValidationIcon}
      >
        {contextEntries.map((entry, index) => (
          <div key={entry.title}>
            <Collapsible defaultOpen={index === 0}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left outline-hidden hover:bg-white/[0.035] focus-visible:bg-white/[0.055]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <HugeiconsIcon
                      icon={NoteIcon}
                      strokeWidth={1.7}
                      className="size-4 text-white/42"
                    />
                    <p className="text-sm font-medium text-white">{entry.title}</p>
                    <Badge variant="outline" className={cn("rounded-full", toneClass(entry.tone))}>
                      {entry.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/42">
                    {entry.source} - Updated {entry.updated}
                  </p>
                </div>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={1.8}
                  className="size-4 shrink-0 text-white/42 transition-transform group-data-[panel-open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent hiddenUntilFound>
                <div className="px-5 pb-5">
                  <MarkdownBlock markdown={entry.markdown} />
                </div>
              </CollapsibleContent>
            </Collapsible>
            {index < contextEntries.length - 1 ? <Separator className="bg-white/8" /> : null}
          </div>
        ))}
      </ResourceCard>
    </main>
  );
}
