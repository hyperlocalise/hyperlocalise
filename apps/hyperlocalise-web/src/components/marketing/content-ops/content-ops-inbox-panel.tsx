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
import { Chat01Icon, ClipboardListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/primitives/cn";

import { CONTENT_OPS_MOCK_INNER_CLASSNAME } from "./content-ops-mock-stage.constants";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

type InboxItemKind = "conversation" | "issue";

type InboxItem = {
  id: string;
  kind: InboxItemKind;
  title: string;
  preview: string;
  meta: string;
  avatarLabel: string;
  unread?: boolean;
};

type IssueDetail = {
  identifier: string;
  title: string;
  description: string;
  locale: string;
  statusKey: "statusOpen" | "statusInProgress" | "statusResolved";
  project: string;
  sourcePath: string;
};

type AssistantTurn = {
  role: "user" | "assistant";
  text: string;
};

function InboxListItem({ item, selected }: { item: InboxItem; selected: boolean }) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-2.5 transition-colors",
        selected ? "bg-accent text-foreground" : "text-foreground",
        item.unread && !selected && "bg-muted/40",
      )}
    >
      <Avatar className="size-8 bg-muted">
        <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
          {item.kind === "issue" ? (
            <HugeiconsIcon icon={ClipboardListIcon} strokeWidth={1.8} className="size-3.5" />
          ) : (
            item.avatarLabel
          )}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className={cn("truncate text-sm", item.unread && "font-semibold")}>{item.title}</p>
          {item.unread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{item.preview}</p>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{item.meta}</span>
        </div>
      </div>
    </div>
  );
}

function IssueDetailMock({ issue }: { issue: IssueDetail }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">
          {issue.identifier}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {issue.locale}
        </span>
        <span
          className={cn(
            "ms-auto text-[10px] font-medium",
            issue.statusKey === "statusResolved"
              ? "text-emerald-600"
              : issue.statusKey === "statusInProgress"
                ? "text-primary"
                : "text-amber-700",
          )}
        >
          <FormattedMessage {...contentOpsMockStageMessages[issue.statusKey]} />
        </span>
      </div>

      <h3 className="mt-3 text-base font-semibold leading-snug text-foreground">{issue.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{issue.description}</p>

      <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.inboxIssueProjectLabel} />
          </dt>
          <dd className="mt-0.5 text-foreground">{issue.project}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.inboxIssueSourceLabel} />
          </dt>
          <dd className="mt-0.5 font-mono text-foreground">{issue.sourcePath}</dd>
        </div>
      </dl>
    </div>
  );
}

function AssistantChatMock({ turns }: { turns: AssistantTurn[] }) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <div className="flex min-h-0 flex-col border-t border-border/60 bg-muted/15">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
        <HugeiconsIcon
          icon={Chat01Icon}
          strokeWidth={1.8}
          className="size-3.5 text-muted-foreground"
        />
        <span className="text-xs font-medium text-foreground">
          <FormattedMessage {...contentOpsMockStageMessages.inboxAssistantTitle} />
        </span>
      </div>

      <div className="max-h-40 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <AnimatePresence initial={false}>
          {turns.map((turn, index) => (
            <motion.div
              key={`${turn.role}-${index}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.24 }}
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6",
                turn.role === "user"
                  ? "ms-auto bg-muted text-foreground"
                  : "bg-background text-foreground shadow-sm ring-1 ring-border/60",
              )}
            >
              {turn.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ContentOpsInboxPanel({ highlightedIndex = 0 }: { highlightedIndex?: number }) {
  const intl = useIntl();

  const items: InboxItem[] = [
    {
      id: "conv-de-cta",
      kind: "conversation",
      title: intl.formatMessage(contentOpsMockStageMessages.inboxConvDeCtaTitle),
      preview: intl.formatMessage(contentOpsMockStageMessages.inboxConvDeCtaPreview),
      meta: intl.formatMessage(contentOpsMockStageMessages.inboxConvDeCtaMeta),
      avatarLabel: "SL",
    },
    {
      id: "issue-web-2",
      kind: "issue",
      title: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Title),
      preview: intl.formatMessage(contentOpsMockStageMessages.inboxIssueWeb2Preview),
      meta: intl.formatMessage(contentOpsMockStageMessages.inboxIssueNotificationMeta),
      avatarLabel: "MC",
      unread: true,
    },
    {
      id: "conv-glossary",
      kind: "conversation",
      title: intl.formatMessage(contentOpsMockStageMessages.inboxConvGlossaryTitle),
      preview: intl.formatMessage(contentOpsMockStageMessages.inboxConvGlossaryPreview),
      meta: intl.formatMessage(contentOpsMockStageMessages.inboxConvGlossaryMeta),
      avatarLabel: "AK",
    },
  ];

  const issuesById: Record<string, IssueDetail> = {
    "issue-web-2": {
      identifier: "WEB-2",
      title: intl.formatMessage(contentOpsMockStageMessages.issueWeb2Title),
      description: intl.formatMessage(contentOpsMockStageMessages.inboxIssueWeb2Description),
      locale: "fr-FR",
      statusKey: "statusInProgress",
      project: intl.formatMessage(contentOpsMockStageMessages.inboxIssueWeb2Project),
      sourcePath: "checkout.json",
    },
  };

  const assistantByItemId: Record<string, AssistantTurn[]> = {
    "conv-de-cta": [
      {
        role: "user",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantDeCtaQuestion),
      },
      {
        role: "assistant",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantDeCtaAnswer),
      },
    ],
    "issue-web-2": [
      {
        role: "user",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantWeb2Question),
      },
      {
        role: "assistant",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantWeb2Answer),
      },
    ],
    "conv-glossary": [
      {
        role: "user",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantGlossaryQuestion),
      },
      {
        role: "assistant",
        text: intl.formatMessage(contentOpsMockStageMessages.inboxAssistantGlossaryAnswer),
      },
    ],
  };

  const selectedIndex = highlightedIndex % items.length;
  const selectedItem = items[selectedIndex]!;
  const selectedIssue =
    selectedItem.kind === "issue" ? issuesById[selectedItem.id] : issuesById["issue-web-2"];
  const assistantTurns = assistantByItemId[selectedItem.id] ?? [];

  return (
    <div
      className={cn(
        CONTENT_OPS_MOCK_INNER_CLASSNAME,
        "grid lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]",
      )}
    >
      <section className="flex min-h-0 flex-col border-b border-border/50 lg:border-b-0 lg:border-r">
        <div className="border-b border-border/50 px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            <FormattedMessage {...contentOpsMockStageMessages.inboxTitle} />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((item, index) => (
            <InboxListItem key={item.id} item={item} selected={index === selectedIndex} />
          ))}
        </div>
      </section>

      <section className="flex min-h-0 min-h-[18rem] flex-col lg:min-h-0">
        {selectedItem.kind === "issue" && selectedIssue ? (
          <IssueDetailMock issue={selectedIssue} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{selectedItem.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selectedItem.meta}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {selectedItem.preview}
                </p>
              </div>
            </div>
          </div>
        )}

        <AssistantChatMock turns={assistantTurns} />
      </section>
    </div>
  );
}
