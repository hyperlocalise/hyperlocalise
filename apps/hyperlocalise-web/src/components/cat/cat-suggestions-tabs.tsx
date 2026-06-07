"use client";

import { useId, useState } from "react";
import { ArrowDown01Icon, ArrowUp01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
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
  const drawerToggleId = useId();
  const drawerContentId = useId();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="group/suggestions relative flex min-h-0 flex-1 flex-col">
      <input
        id={drawerToggleId}
        type="checkbox"
        checked={isOpen}
        onChange={(event) => setIsOpen(event.currentTarget.checked)}
        className="absolute top-0.5 right-2 z-20 h-8 w-24 cursor-pointer appearance-none rounded transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden"
        aria-controls={drawerContentId}
        aria-label="Show suggestions drawer"
      />

      <Tabs defaultValue="suggestions" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-foreground/8 bg-transparent px-4 pe-28">
          <TabsTrigger value="suggestions">Suggestions {suggestions.length}</TabsTrigger>
          <TabsTrigger value="history">History {historyCount}</TabsTrigger>
          <TabsTrigger value="glossary">Glossary matches {glossaryMatchCount}</TabsTrigger>
        </TabsList>

        <div
          id={drawerContentId}
          className="hidden min-h-0 flex-1 flex-col group-has-[input:checked]/suggestions:flex"
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
        </div>
      </Tabs>

      <div className="pointer-events-none absolute top-0.5 right-2 z-30 inline-flex h-8 w-24 shrink-0 items-center justify-center gap-1 rounded px-2 text-sm font-medium text-muted-foreground">
        <span className="hidden group-has-[input:checked]/suggestions:inline">Collapse</span>
        <span className="group-has-[input:checked]/suggestions:hidden">Expand</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="size-4 group-has-[input:not(:checked)]/suggestions:hidden"
        />
        <HugeiconsIcon
          icon={ArrowUp01Icon}
          className="hidden size-4 group-has-[input:not(:checked)]/suggestions:block"
        />
      </div>
    </div>
  );
}
