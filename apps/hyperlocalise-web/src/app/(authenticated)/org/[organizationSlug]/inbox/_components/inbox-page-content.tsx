"use client";

import {
  Add01Icon,
  ArrowUp01Icon,
  Attachment01Icon,
  BubbleChatIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  MailReceive01Icon,
  Mic01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  TypographyH1,
  TypographyH4,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";

const suggestedRequests = [
  {
    icon: MailReceive01Icon,
    title: "Triage the latest launch emails",
    detail: "3 new requests need locale scope and owner assignment",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Prepare approval notes for blocked reviews",
    detail: "Summarize blockers across ja-JP, pt-BR, and es-ES",
  },
  {
    icon: BubbleChatIcon,
    title: "Draft a reply for campaign localization",
    detail: "Use the glossary and keep legal disclaimers unchanged",
  },
  {
    icon: Clock01Icon,
    title: "Show inbox work due today",
    detail: "Prioritize requests that affect the next release window",
  },
] as const;

export function InboxPageContent() {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-5xl flex-col items-center justify-center py-8">
      <section className="w-full max-w-4xl">
        <div className="mb-7 text-center">
          <TypographyH1 className="text-foreground">What should we localise today?</TypographyH1>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-app-shell-background text-foreground shadow-2xl">
          <label htmlFor="inbox-request" className="sr-only">
            Inbox request
          </label>
          <textarea
            id="inbox-request"
            className="min-h-24 w-full resize-none rounded-3xl px-4 py-4 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:px-5"
            defaultValue="in the sidebar, we should promote Inbox at the top"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 bg-muted">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                aria-label="Add context"
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full px-2.5 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
              >
                <HugeiconsIcon icon={Attachment01Icon} strokeWidth={1.8} className="size-4" />
                Sources
              </Button>
              <TypographyMuted className="hidden text-muted-foreground sm:block">
                Default permissions
              </TypographyMuted>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TypographyMuted className="hidden text-muted-foreground sm:block">
                5.5
              </TypographyMuted>
              <TypographyMuted className="hidden text-muted-foreground sm:block">
                Medium
              </TypographyMuted>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                aria-label="Voice input"
              >
                <HugeiconsIcon icon={Mic01Icon} strokeWidth={1.8} className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                className="rounded-full bg-foreground text-app-shell-background hover:bg-foreground/90"
                aria-label="Send request"
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <TypographyMuted className="mt-5 flex items-center justify-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={1.7} className="size-3.5" />
          Agent can turn inbox requests into jobs, glossary updates, or reviewer tasks.
        </TypographyMuted>

        <div className="space-y-1.4 mt-6">
          <TypographyH4>Suggestions</TypographyH4>
          <div className="rounded-xl border border-border/20 bg-muted/5">
            {suggestedRequests.map((request, index) => (
              <div key={request.title}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/10"
                >
                  <HugeiconsIcon
                    icon={request.icon}
                    strokeWidth={1.7}
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0">
                    <TypographySmall className="block text-foreground">
                      {request.title}
                    </TypographySmall>
                    <TypographyMuted className="mt-1 text-muted-foreground">
                      {request.detail}
                    </TypographyMuted>
                  </div>
                </button>
                {index < suggestedRequests.length - 1 ? (
                  <Separator className="bg-border/20" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
