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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { MessageResponse } from "@/components/ai-elements/message";
import { useOptionalAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { TypographyMuted } from "@/components/ui/typography";
import {
  summarizeAutomationSetupCall,
  type AutomationSetupCallSummary,
} from "@/lib/agents/workspace-automation-assistant";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";
import { cn } from "@/lib/primitives/cn";

import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import { AutomationAssistantToolCall } from "./automation-assistant-tool-call";
import { automationAssistantMessages as messages } from "./automation-assistant.messages";
import { useAutomationAssistant } from "./automation-assistant-provider";

type Block = { kind: "text"; text: string } | { kind: "tool"; summary: AutomationSetupCallSummary };

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
    const summary = summarizeAutomationSetupCall(part);
    if (summary) {
      blocks.push({ kind: "tool", summary });
    }
  }
  return blocks;
}

function Reply({ parts, pending }: { parts: UIMessage["parts"]; pending: boolean }) {
  const blocks = toBlocks(parts);
  const last = blocks.at(-1);
  // A call that is still running says so itself; a second spinner under it would say it twice.
  const showWorking = pending && !(last?.kind === "tool" && last.summary.state === "running");
  return (
    <div className="flex flex-col gap-2 text-sm leading-6">
      {blocks.map((block, index) =>
        block.kind === "text" ? (
          // List markers sit outside their text, so lists are indented to keep them in the panel.
          // A line that leads into a list, such as a "Skills used:" label, sits close to it.
          <MessageResponse
            key={index}
            className="[&_ol]:ps-5 [&_ul]:ps-5 [&>p:has(+ol)]:mb-1.5 [&>p:has(+ul)]:mb-1.5"
          >
            {block.text}
          </MessageResponse>
        ) : (
          <AutomationAssistantToolCall key={index} summary={block.summary} />
        ),
      )}
      {showWorking ? (
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
  const listRef = useRef<HTMLDivElement>(null);
  const messageCount = assistant?.messages.length ?? 0;
  const streamingLength = assistant?.streaming?.parts.length ?? 0;

  const working = assistant?.working ?? false;

  // Only the panel's own list moves; scrolling an element into view would move the page too.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messageCount, streamingLength, working]);

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
      <header className="flex items-center gap-2 border-b border-border py-2 ps-5 pe-3">
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
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
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
        {assistant.streaming ? (
          <Reply parts={assistant.streaming.parts} pending />
        ) : assistant.working ? (
          <Reply parts={[]} pending />
        ) : null}
      </div>
      <footer className="flex flex-col gap-2 border-t border-border p-3">
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
          label={intl.formatMessage(messages.composerLabel)}
          placeholder={intl.formatMessage(messages.composerPlaceholder)}
          submitLabel={intl.formatMessage(messages.composerSend)}
          compact
        />
      </footer>
    </section>
  );
}

const TOP_BAR_TOGGLE_ID = "automation-assistant";

/** The assistant's one opener: a button in the app's top bar that opens and closes the panel. */
function AutomationAssistantToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const intl = useIntl();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={intl.formatMessage(messages.toggle)}
      aria-pressed={open}
      className={open ? "bg-muted text-foreground" : undefined}
      onClick={onToggle}
    >
      <SparkleIcon />
      {/* The icon alone where the top bar is short of room. */}
      <span className="hidden sm:inline">
        <FormattedMessage {...messages.toggle} />
      </span>
    </Button>
  );
}

/**
 * What an automation page gives its shell when the assistant is offered: the page fills the
 * app's content area edge to edge and does not scroll, so the form and the panel can each be a
 * pane of their own. It undoes the content area's padding, which the form's pane puts back.
 */
export const AUTOMATION_ASSISTANT_PAGE_CLASS =
  "-mx-4 -my-4 w-auto min-h-0 flex-1 gap-0 overflow-hidden sm:-mx-6 lg:-mx-8";

/** Below this much room the form would be too narrow beside the panel, so the panel is a sheet. */
const SIDE_BY_SIDE_MIN_WIDTH_PX = 960;

/**
 * Lays an automation page out as two panes: the form, which scrolls by itself, and the assistant
 * attached to the right edge at full height. Where the page has no room for both, the panel is a
 * sheet from the right edge. The page must carry `AUTOMATION_ASSISTANT_PAGE_CLASS`. Also puts the
 * assistant's toggle in the app's top bar while the page is open.
 */
export function AutomationAssistantLayout({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const assistant = useAutomationAssistant();
  const headerActions = useOptionalAppShellStore()?.headerActions ?? null;
  const rowRef = useRef<HTMLDivElement>(null);
  // Decided from the room the page really has, which the sidebar changes, not from the window.
  const [roomBeside, setRoomBeside] = useState(true);
  const offered = assistant !== null;
  const open = assistant?.open ?? false;
  const setOpen = assistant?.setOpen;

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    // A width of nothing means no layout has happened, as in a test; the default stands.
    const measure = () => {
      if (row.clientWidth > 0) {
        setRoomBeside(row.clientWidth >= SIDE_BY_SIDE_MIN_WIDTH_PX);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  // The top bar draws what is registered with it, so the button is registered again whenever
  // what it shows changes.
  useEffect(() => {
    if (!headerActions || !setOpen) {
      return;
    }
    headerActions.register({
      id: TOP_BAR_TOGGLE_ID,
      order: 0,
      visible: true,
      render: () => <AutomationAssistantToggle open={open} onToggle={() => setOpen(!open)} />,
    });
  }, [headerActions, open, setOpen]);

  useEffect(() => {
    if (!headerActions || !offered) {
      return;
    }
    return () => headerActions.unregister(TOP_BAR_TOGGLE_ID);
  }, [headerActions, offered]);

  const inSheet = !roomBeside;
  return (
    <div ref={rowRef} className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex max-w-5xl flex-col gap-4">{children}</div>
      </div>
      {assistant?.open && !inSheet ? (
        <aside className="w-[380px] shrink-0 border-s border-border">
          <AutomationAssistantPanel className="rounded-none border-0" />
        </aside>
      ) : null}
      {assistant && inSheet ? (
        <Sheet open={assistant.open} onOpenChange={assistant.setOpen}>
          {/* The panel has its own close button. */}
          <SheetContent
            side="right"
            showCloseButton={false}
            className="flex w-full flex-col p-2 sm:max-w-md"
          >
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
