"use client";

import { DatabaseSyncIcon, FileSyncIcon, LanguageSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MetricsGrid,
  PageHeader,
  ResourceCard,
  toneClass,
} from "../../_components/workspace-resource-shared";

const memoryMetrics = [
  { label: "Segments", value: "284k", detail: "92% reusable", tone: "safe" },
  { label: "Locales", value: "18", detail: "6 synced", tone: "info" },
  { label: "Conflicts", value: "12", detail: "needs review", tone: "watch" },
] as const;

const memories = [
  {
    name: "Product UI memory",
    source: "GitHub strings",
    locales: "12 locales",
    match: "94% match rate",
    updated: "8m ago",
    tone: "safe",
  },
  {
    name: "Marketing campaigns",
    source: "Phrase",
    locales: "8 locales",
    match: "81% match rate",
    updated: "42m ago",
    tone: "watch",
  },
  {
    name: "Help center archive",
    source: "Crowdin",
    locales: "14 locales",
    match: "88% match rate",
    updated: "2h ago",
    tone: "info",
  },
] as const;

export function TranslationMemoriesPageContent() {
  return (
    <main className="space-y-5">
      <PageHeader
        icon={DatabaseSyncIcon}
        label="Manage"
        title="Translation Memories"
        description="Manage reusable translated segments, source matching, and synchronization state for future localization work."
        statusLabel="Mock data"
      />

      <MetricsGrid metrics={memoryMetrics} />

      <ResourceCard
        title="Memory stores"
        description="Mock translation memory sources grouped by workflow and sync health."
        icon={FileSyncIcon}
      >
        {memories.map((memory, index) => (
          <div key={memory.name}>
            <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={LanguageSquareIcon}
                    strokeWidth={1.7}
                    className="size-4 text-white/42"
                  />
                  <p className="truncate text-sm font-medium text-white">{memory.name}</p>
                </div>
                <p className="mt-1 text-xs text-white/42">
                  {memory.source} · Updated {memory.updated}
                </p>
              </div>
              <p className="text-sm text-white/58">{memory.locales}</p>
              <p className="text-sm text-white/58">{memory.match}</p>
              <Badge variant="outline" className={toneClass(memory.tone)}>
                Synced
              </Badge>
            </div>
            {index < memories.length - 1 ? <Separator className="bg-white/8" /> : null}
          </div>
        ))}
      </ResourceCard>
    </main>
  );
}
