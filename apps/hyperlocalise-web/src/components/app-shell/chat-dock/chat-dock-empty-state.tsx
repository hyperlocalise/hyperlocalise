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
import type { ComponentProps } from "react";
import { Chat01Icon, FileSearchIcon, Image01Icon, FileVideoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, type MessageDescriptor, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";

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
  if (pageContext?.kind === "content-editor-segment") {
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
    {
      id: "localize-image",
      icon: Image01Icon,
      label: formatMessage(chatDockMessages.suggestionLocalizeImage),
      prompt: `${formatMessage(chatDockMessages.promptLocalizeImage)} `,
    },
    {
      id: "localize-video",
      icon: FileVideoIcon,
      label: formatMessage(chatDockMessages.suggestionLocalizeVideo),
      prompt: `${formatMessage(chatDockMessages.promptLocalizeVideo)} `,
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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3u"
        paddingX="3u"
        paddingY="4u"
        height="full"
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          background="muted"
          borderRadius="standard"
          padding="1u"
        >
          <HugeiconsIcon
            icon={Chat01Icon}
            strokeWidth={1.8}
            className="size-5 text-muted-foreground"
          />
        </Box>

        <Rows spacing="0.5u" align="center">
          <h2 className="max-w-sm text-balance text-sm font-semibold text-foreground">
            <FormattedMessage {...chatDockMessages.emptyTitle} />
          </h2>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            <FormattedMessage {...chatDockMessages.emptySubtitle} />
          </p>
        </Rows>

        <Box
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          justifyContent="center"
          gap="1u"
          width="full"
        >
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
        </Box>
      </Box>
    </div>
  );
}
