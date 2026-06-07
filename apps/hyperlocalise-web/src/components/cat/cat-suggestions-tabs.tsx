"use client";

import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/primitives/cn";

import { catToneClass, suggestionSourceLabel } from "./cat-tone";
import type { CatSuggestion } from "./types";

function SuggestionRow({ suggestion, onUse }: { suggestion: CatSuggestion; onUse: () => void }) {
  return (
    <li className="rounded-lg border border-foreground/8 bg-foreground/2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full text-[10px]", catToneClass("info"))}
            >
              {suggestionSourceLabel(suggestion.source)}
              {suggestion.matchPercent ? ` ${suggestion.matchPercent}%` : ""}
            </Badge>
            {suggestion.metadata ? (
              <span className="text-xs text-muted-foreground">{suggestion.metadata}</span>
            ) : null}
          </div>
          <p className="text-sm text-foreground/88">{suggestion.text}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onUse}>
          Use
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
  return (
    <Tabs defaultValue="suggestions" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="w-full justify-start rounded-none border-b border-foreground/8 bg-transparent px-4">
        <TabsTrigger value="suggestions">Suggestions {suggestions.length}</TabsTrigger>
        <TabsTrigger value="history">History {historyCount}</TabsTrigger>
        <TabsTrigger value="glossary">Glossary matches {glossaryMatchCount}</TabsTrigger>
      </TabsList>

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
            Based on {tmMatchBasisCount} similar translations
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="history" className="mt-0 p-4">
        <p className="text-sm text-muted-foreground">
          {historyCount > 0
            ? `${historyCount} previous revisions available for this string.`
            : "No revision history yet."}
        </p>
      </TabsContent>

      <TabsContent value="glossary" className="mt-0 p-4">
        <p className="text-sm text-muted-foreground">
          {glossaryMatchCount > 0
            ? `${glossaryMatchCount} approved glossary terms match this segment.`
            : "No glossary matches for this segment."}
        </p>
      </TabsContent>
    </Tabs>
  );
}
