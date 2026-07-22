"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ComponentProps } from "react";
import { Chat01Icon, FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, type MessageDescriptor, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";

import { chatDockMessages } from "./chat-dock.messages";
import type { ChatDockPageContext } from "./chat-dock-store";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];

type Suggestion = {
  id: string;
  icon: Icon;
  label: string;
  prompt: string;
};

type FormatMessage = (descriptor: MessageDescriptor, values?: Record<string, string>) => string;

const SOURCE_LABEL_MAX_LENGTH = 36;

function truncateLabel(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function buildChatDockSuggestions(
  pageContext: ChatDockPageContext | null,
  formatMessage: FormatMessage,
): Suggestion[] {
  if (pageContext?.kind === "cat-segment") {
    const sourceLabel = truncateLabel(pageContext.sourceText, SOURCE_LABEL_MAX_LENGTH);
    return [
      {
        id: "segment-context",
        icon: FileSearchIcon,
        label: formatMessage(chatDockMessages.suggestionSegmentContext, {
          source: sourceLabel,
        }),
        prompt: formatMessage(chatDockMessages.promptSegmentContext, {
          source: pageContext.sourceText,
        }),
      },
    ];
  }

  return [
    {
      id: "find-context",
      icon: FileSearchIcon,
      label: formatMessage(chatDockMessages.suggestionFindContext),
      // Trailing space lets the user finish typing the string.
      prompt: `${formatMessage(chatDockMessages.promptFindContext)} `,
    },
  ];
}

export function ChatDockEmptyState({
  pageContext = null,
  onSelectSuggestion,
}: {
  pageContext?: ChatDockPageContext | null;
  onSelectSuggestion: (prompt: string) => void;
}) {
  const intl = useIntl();
  const suggestions = buildChatDockSuggestions(pageContext, intl.formatMessage);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <HugeiconsIcon icon={Chat01Icon} strokeWidth={1.8} className="size-5" />
      </div>

      <div className="max-w-sm space-y-1">
        <h2 className="text-balance text-sm font-semibold text-foreground">
          <FormattedMessage {...chatDockMessages.emptyTitle} />
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          <FormattedMessage {...chatDockMessages.emptySubtitle} />
        </p>
      </div>

      <div className="flex max-w-sm flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-background text-xs font-medium"
            onClick={() => onSelectSuggestion(suggestion.prompt)}
          >
            <HugeiconsIcon icon={suggestion.icon} strokeWidth={1.8} className="size-3.5" />
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
