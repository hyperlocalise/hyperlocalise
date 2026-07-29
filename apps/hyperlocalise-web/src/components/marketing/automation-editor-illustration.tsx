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
import type { ReactNode } from "react";

import { BrainCircuitIcon, File01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { cn } from "@/lib/primitives/cn";

import { automationEditorIllustrationMessages } from "./automation-editor-illustration.messages";

function MockSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-2 text-[0.7rem] font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function MockPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-muted", className)}>
      {children}
    </div>
  );
}

function MockRow({
  icon,
  title,
  description,
  trailing,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8rem] font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-0.5 text-[0.7rem] leading-4 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 self-center">{trailing}</div> : null}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2 text-[0.72rem] text-foreground">
      {children}
    </span>
  );
}

function ContentfulMark() {
  return (
    <span
      className="flex size-4 items-center justify-center rounded-[0.2rem] bg-[#FC6176] text-[0.55rem] font-bold text-white"
      aria-hidden
    >
      C
    </span>
  );
}

export function AutomationEditorIllustration({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_64px_rgba(0,0,0,0.22)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[0.85rem] font-semibold tracking-[-0.02em] text-foreground">
            <FormattedMessage {...automationEditorIllustrationMessages.automationName} />
          </p>
          <p className="mt-0.5 text-[0.68rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            <FormattedMessage {...automationEditorIllustrationMessages.settingsTab} />
          </p>
        </div>
        <span className="inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      </header>

      <div className="flex max-h-[26rem] flex-col gap-4 overflow-y-auto overscroll-contain p-3 sm:max-h-[28rem] sm:p-4">
        <MockSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.triggersSection} />}
        >
          <MockPanel>
            <MockRow
              icon={<HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-4" />}
              title={
                <FormattedMessage {...automationEditorIllustrationMessages.contentfulWebhook} />
              }
              trailing={
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill>
                    <FormattedMessage {...automationEditorIllustrationMessages.space} />
                  </Pill>
                  <Pill>
                    <FormattedMessage {...automationEditorIllustrationMessages.contentType} />
                  </Pill>
                </div>
              }
            />
          </MockPanel>
        </MockSection>

        <MockSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.instructionsSection} />}
        >
          <MockPanel className="bg-muted">
            <pre className="max-h-36 overflow-hidden whitespace-pre-wrap px-3 py-3 font-sans text-[0.72rem] leading-5 text-foreground/90">
              <FormattedMessage {...automationEditorIllustrationMessages.instructionsBody} />
            </pre>
          </MockPanel>
        </MockSection>

        <MockSection
          title={<FormattedMessage {...automationEditorIllustrationMessages.toolsSection} />}
        >
          <MockPanel>
            <MockRow
              icon={<HugeiconsIcon icon={BrainCircuitIcon} strokeWidth={1.8} className="size-4" />}
              title={<FormattedMessage {...automationEditorIllustrationMessages.toolKnowledge} />}
              description={
                <FormattedMessage
                  {...automationEditorIllustrationMessages.toolKnowledgeDescription}
                />
              }
            />
            <MockRow
              icon={<ContentfulMark />}
              title={<FormattedMessage {...automationEditorIllustrationMessages.toolContentful} />}
              description={
                <FormattedMessage
                  {...automationEditorIllustrationMessages.toolContentfulDescription}
                />
              }
            />
            <MockRow
              icon={
                <span
                  className="flex size-4 items-center justify-center rounded-[0.2rem] bg-[#4a154b] text-[0.55rem] font-bold text-white"
                  aria-hidden
                >
                  #
                </span>
              }
              title={<FormattedMessage {...automationEditorIllustrationMessages.toolSlack} />}
              description={
                <FormattedMessage {...automationEditorIllustrationMessages.toolSlackDescription} />
              }
            />
            <div className="flex items-center gap-2 px-3 py-2.5 text-[0.72rem] font-medium text-muted-foreground">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.8} className="size-3.5" />
              <FormattedMessage {...automationEditorIllustrationMessages.addTool} />
            </div>
          </MockPanel>
        </MockSection>
      </div>
    </div>
  );
}
