"use client";

import { useId, useState } from "react";
import { ArrowDown01Icon, ArrowUp01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";

import { catSuggestionsTabsMessages, catToneMessages } from "./cat.messages";
import { catToneClass } from "./cat-tone";
import type { CatSuggestion } from "./types";

function suggestionSourceLabel(source: string, intl: ReturnType<typeof useIntl>) {
  switch (source) {
    case "ai":
      return intl.formatMessage(catToneMessages.sourceAi);
    case "glossary":
      return intl.formatMessage(catToneMessages.sourceGlossary);
    case "tm":
      return intl.formatMessage(catToneMessages.sourceTm);
    default:
      return source;
  }
}

function SuggestionRow({ suggestion, onUse }: { suggestion: CatSuggestion; onUse: () => void }) {
  const intl = useIntl();

  return (
    <li className="rounded-lg border border-foreground/8 bg-foreground/2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full text-[10px]", catToneClass("info"))}
            >
              {suggestionSourceLabel(suggestion.source, intl)}
              {suggestion.matchPercent ? ` ${suggestion.matchPercent}%` : ""}
            </Badge>
            {suggestion.metadata ? (
              <span className="text-xs text-muted-foreground">{suggestion.metadata}</span>
            ) : null}
          </div>
          <p className="text-sm text-foreground/88">{suggestion.text}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onUse}>
          <FormattedMessage {...catSuggestionsTabsMessages.use} />
        </Button>
      </div>
    </li>
  );
}

export function CatSuggestionsTabs({
  suggestions,
  historyCount = 0,
  glossaryMatchCount = 0,
  tmMatchBasisCount,
  onUseSuggestion,
}: {
  suggestions: CatSuggestion[];
  historyCount?: number;
  glossaryMatchCount?: number;
  tmMatchBasisCount?: number;
  onUseSuggestion: (suggestion: CatSuggestion) => void;
}) {
  const drawerContentId = useId();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Tabs defaultValue="suggestions" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-foreground/8 bg-transparent px-4 pe-28">
          <TabsTrigger value="suggestions">
            <FormattedMessage
              {...catSuggestionsTabsMessages.suggestionsTab}
              values={{ count: suggestions.length }}
            />
          </TabsTrigger>
          <TabsTrigger value="history">
            <FormattedMessage
              {...catSuggestionsTabsMessages.historyTab}
              values={{ count: historyCount }}
            />
          </TabsTrigger>
          <TabsTrigger value="glossary">
            <FormattedMessage
              {...catSuggestionsTabsMessages.glossaryTab}
              values={{ count: glossaryMatchCount }}
            />
          </TabsTrigger>
        </TabsList>

        <div
          id={drawerContentId}
          className={cn("min-h-0 flex-1 flex-col", isOpen ? "flex" : "hidden")}
        >
          <TabsContent
            value="suggestions"
            className="mt-0 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col"
          >
            <ScrollArea className="min-h-0 flex-1">
              <ul className="space-y-2 p-4">
                {suggestions.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.id}
                    suggestion={suggestion}
                    onUse={() => onUseSuggestion(suggestion)}
                  />
                ))}
              </ul>
            </ScrollArea>
            {tmMatchBasisCount ? (
              <div className="flex items-center gap-1.5 border-t border-foreground/8 px-4 py-2 text-xs text-muted-foreground">
                <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" />
                <FormattedMessage
                  {...catSuggestionsTabsMessages.basedOnSimilar}
                  values={{ count: tmMatchBasisCount }}
                />
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="history" className="mt-0 p-4">
            <p className="text-sm text-muted-foreground">
              {historyCount > 0 ? (
                <FormattedMessage
                  {...catSuggestionsTabsMessages.historyAvailable}
                  values={{ count: historyCount }}
                />
              ) : (
                <FormattedMessage {...catSuggestionsTabsMessages.noHistory} />
              )}
            </p>
          </TabsContent>

          <TabsContent value="glossary" className="mt-0 p-4">
            <p className="text-sm text-muted-foreground">
              {glossaryMatchCount > 0 ? (
                <FormattedMessage
                  {...catSuggestionsTabsMessages.glossaryMatches}
                  values={{ count: glossaryMatchCount }}
                />
              ) : (
                <FormattedMessage {...catSuggestionsTabsMessages.noGlossaryMatches} />
              )}
            </p>
          </TabsContent>
        </div>
      </Tabs>

      <button
        type="button"
        className="absolute top-0.5 right-2 z-20 inline-flex h-8 w-24 shrink-0 items-center justify-center gap-1 rounded px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden"
        aria-controls={drawerContentId}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? (
          <FormattedMessage {...catSuggestionsTabsMessages.collapse} />
        ) : (
          <FormattedMessage {...catSuggestionsTabsMessages.expand} />
        )}
        <HugeiconsIcon icon={isOpen ? ArrowDown01Icon : ArrowUp01Icon} className="size-4" />
      </button>
    </div>
  );
}
