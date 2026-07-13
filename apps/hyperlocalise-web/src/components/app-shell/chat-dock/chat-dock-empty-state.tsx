"use client";

import type { ComponentProps } from "react";
import {
  AnalyticsUpIcon,
  Chat01Icon,
  Clock01Icon,
  FileSearchIcon,
  TranslateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";

import { chatDockMessages } from "./chat-dock.messages";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];
type MessageDescriptor = (typeof chatDockMessages)[keyof typeof chatDockMessages];

type Suggestion = {
  icon: Icon;
  label: MessageDescriptor;
  prompt: MessageDescriptor;
};

const suggestions: Suggestion[] = [
  {
    icon: FileSearchIcon,
    label: chatDockMessages.suggestionFindContext,
    prompt: chatDockMessages.promptFindContext,
  },
  {
    icon: Clock01Icon,
    label: chatDockMessages.suggestionRecentChanges,
    prompt: chatDockMessages.promptRecentChanges,
  },
  {
    icon: AnalyticsUpIcon,
    label: chatDockMessages.suggestionProgress,
    prompt: chatDockMessages.promptProgress,
  },
  {
    icon: TranslateIcon,
    label: chatDockMessages.suggestionTranslate,
    prompt: chatDockMessages.promptTranslate,
  },
];

export function ChatDockEmptyState({
  onSelectSuggestion,
}: {
  onSelectSuggestion: (prompt: string) => void;
}) {
  const intl = useIntl();

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
            key={suggestion.label.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-background text-xs font-medium"
            onClick={() => onSelectSuggestion(intl.formatMessage(suggestion.prompt))}
          >
            <HugeiconsIcon icon={suggestion.icon} strokeWidth={1.8} className="size-3.5" />
            <FormattedMessage {...suggestion.label} />
          </Button>
        ))}
      </div>
    </div>
  );
}
