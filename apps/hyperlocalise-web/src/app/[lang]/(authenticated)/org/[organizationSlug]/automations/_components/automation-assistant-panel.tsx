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
import { ArrowCounterClockwiseIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { TypographyMuted } from "@/components/ui/typography";
import { useIsMobile } from "@/hooks/use-mobile";
import { UPDATE_AUTOMATION_SETUP_TOOL_NAME } from "@/lib/agents/workspace-automation-assistant";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";
import { cn } from "@/lib/primitives/cn";

import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import { automationAssistantMessages as messages } from "./automation-assistant.messages";
import { useAutomationAssistant } from "./automation-assistant-provider";

type Block = { kind: "text"; text: string } | { kind: "tool"; done: boolean };

/** Text and setup-tool parts of a reply, in order, with everything else left out. */
function toBlocks(parts: UIMessage["parts"]): Block[] {
  const blocks: Block[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      const last = blocks.at(-1);
      if (last?.kind === "text") {
        last.text += part.text;
      } else {
        blocks.push({ kind: "text", text: part.text });
      }
      continue;
    }
    const isSetupTool =
      part.type === `tool-${UPDATE_AUTOMATION_SETUP_TOOL_NAME}` ||
      (part.type === "dynamic-tool" && part.toolName === UPDATE_AUTOMATION_SETUP_TOOL_NAME);
    if (isSetupTool) {
      blocks.push({ kind: "tool", done: part.state === "output-available" });
    }
  }
  return blocks;
}

function Reply({ parts, pending }: { parts: UIMessage["parts"]; pending: boolean }) {
  const blocks = toBlocks(parts);
  return (
    <div className="flex flex-col gap-2 text-sm leading-6">
      {blocks.map((block, index) =>
        block.kind === "text" ? (
          <MessageResponse key={index}>{block.text}</MessageResponse>
        ) : (
          <TypographyMuted key={index} size="xsmall" className="flex items-center gap-1.5">
            {block.done ? null : <Spinner className="size-3" />}
            <FormattedMessage {...(block.done ? messages.toolUpdated : messages.toolUpdating)} />
          </TypographyMuted>
        ),
      )}
      {pending ? (
        <TypographyMuted size="xsmall" className="flex items-center gap-1.5">
          <Spinner className="size-3" />
          <FormattedMessage {...messages.working} />
        </TypographyMuted>
      ) : null}
    </div>
  );
}

/** The assistant's conversation for this page: its messages, the reply as it streams, a box to write in. */
export function AutomationAssistantPanel({ className }: { className?: string }) {
  const intl = useIntl();
  const assistant = useAutomationAssistant();
  const aiFeatures = useAiFeaturesAccess();
  const endRef = useRef<HTMLDivElement>(null);
  const messageCount = assistant?.messages.length ?? 0;
  const streamingLength = assistant?.streaming?.parts.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount, streamingLength]);

  if (!assistant) {
    return null;
  }

  return (
    <section
      aria-label={intl.formatMessage(messages.title)}
      className={cn(
        "flex h-full min-h-0 flex-col rounded-xl border border-border bg-background",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SparkleIcon className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <FormattedMessage {...messages.title} />
          </p>
          {assistant.automationName.trim() ? (
            <TypographyMuted size="xsmall" className="truncate">
              {assistant.automationName}
            </TypographyMuted>
          ) : null}
        </div>
        {assistant.session ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={assistant.working}
            onClick={assistant.startOver}
          >
            <ArrowCounterClockwiseIcon />
            <FormattedMessage {...messages.startOver} />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={intl.formatMessage(messages.close)}
          onClick={() => assistant.setOpen(false)}
        >
          <XIcon />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        {assistant.messages.length === 0 && !assistant.streaming ? (
          <TypographyMuted className="text-sm">
            <FormattedMessage {...messages.empty} />
          </TypographyMuted>
        ) : null}
        {assistant.messages.map((message) =>
          message.senderType === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground whitespace-pre-wrap">
                {message.text}
              </div>
            </div>
          ) : (
            <Reply
              key={message.id}
              parts={message.parts ?? [{ type: "text", text: message.text }]}
              pending={false}
            />
          ),
        )}
        {assistant.streaming ? <Reply parts={assistant.streaming.parts} pending /> : null}
        <div ref={endRef} />
      </div>
      <footer className="flex flex-col gap-2 border-t border-border p-2">
        {assistant.error ? (
          <p className="px-1 text-xs text-destructive">
            <FormattedMessage
              {...(assistant.error === "turn_in_progress"
                ? messages.turnInProgress
                : messages.errorGeneric)}
            />
          </p>
        ) : null}
        <AutomationAssistantPrompt
          aiFeaturesStatus={aiFeatures.status}
          onSubmitPrompt={assistant.send}
          organizationSlug=""
          pending={assistant.working}
        />
      </footer>
    </section>
  );
}

/** Opens the assistant beside the form. Renders nothing where the assistant is not offered. */
export function AutomationAssistantOpenButton() {
  const assistant = useAutomationAssistant();
  if (!assistant) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={assistant.open}
      onClick={() => assistant.setOpen(!assistant.open)}
    >
      <SparkleIcon />
      <FormattedMessage {...messages.openButton} />
    </Button>
  );
}

/**
 * Puts the panel beside the editor on a wide screen and in a sheet from the right edge on a
 * narrow one. Never floating, so it cannot be taken for the chat dock.
 */
export function AutomationAssistantLayout({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const assistant = useAutomationAssistant();
  const isMobile = useIsMobile();
  if (!assistant) {
    return children;
  }
  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6">
      <div className="min-w-0 flex-1">{children}</div>
      {assistant.open && !isMobile ? (
        <aside className="sticky top-4 h-[calc(100vh-6rem)] w-[380px] shrink-0 self-start">
          <AutomationAssistantPanel />
        </aside>
      ) : null}
      {isMobile ? (
        <Sheet open={assistant.open} onOpenChange={assistant.setOpen}>
          <SheetContent side="right" className="flex w-full flex-col p-2 sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>{intl.formatMessage(messages.title)}</SheetTitle>
            </SheetHeader>
            <AutomationAssistantPanel className="flex-1 border-0" />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
