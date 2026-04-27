"use client";

import { BookOpenTextIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  MetricsGrid,
  PageHeader,
  ProgressBar,
  ResourceCard,
  toneClass,
} from "./workspace-resource-shared";

const glossaries = [
  {
    name: "Product names",
    terms: "284",
    locales: "12",
    coverage: 91,
    owner: "Yuki Tanaka",
    updated: "12m ago",
    status: "Reviewing",
    tone: "watch",
  },
  {
    name: "Legal disclaimers",
    terms: "143",
    locales: "8",
    coverage: 98,
    owner: "Amelia Stone",
    updated: "37m ago",
    status: "Approved",
    tone: "safe",
  },
  {
    name: "Payments vocabulary",
    terms: "96",
    locales: "10",
    coverage: 84,
    owner: "Jon Bell",
    updated: "2h ago",
    status: "Needs work",
    tone: "risk",
  },
] as const;

const glossaryTerms = [
  {
    source: "checkout session",
    approved: "session de paiement",
    locale: "fr-FR",
    usage: "Payments flow",
    status: "Approved",
    tone: "safe",
  },
  {
    source: "workspace",
    approved: "espacio de trabajo",
    locale: "es-ES",
    usage: "Navigation",
    status: "Approved",
    tone: "safe",
  },
  {
    source: "usage cap",
    approved: "Nutzungslimit",
    locale: "de-DE",
    usage: "Billing",
    status: "Review",
    tone: "watch",
  },
  {
    source: "smart routing",
    approved: "smart routing",
    locale: "ja-JP",
    usage: "Feature copy",
    status: "Conflict",
    tone: "risk",
  },
] as const;

const glossaryMetrics = [
  { label: "Glossaries", value: "9", detail: "3 connected to TMS", tone: "info" },
  { label: "Approved terms", value: "4,820", detail: "92% coverage", tone: "safe" },
  { label: "Conflicts", value: "11", detail: "need reviewer input", tone: "watch" },
] as const;

export function GlossariesPageContent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        icon={BookOpenTextIcon}
        label="Term library"
        title="Glossaries"
        description="Manage approved product terms, legal wording, and locale-specific vocabulary that guides every translation run."
        statusLabel="9 mocked"
      />
      <MetricsGrid metrics={glossaryMetrics} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ResourceCard
          title="Glossary sets"
          description="Mock glossary coverage by domain, locale count, and reviewer state."
          icon={BookOpenTextIcon}
        >
          <div className="px-5 pb-2">
            {glossaries.map((glossary, index) => (
              <div key={glossary.name}>
                <div className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{glossary.name}</p>
                      <Badge
                        variant="outline"
                        className={cn("rounded-full", toneClass(glossary.tone))}
                      >
                        {glossary.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-white/42">
                      Owner: {glossary.owner} · Updated {glossary.updated}
                    </p>
                  </div>
                  <p className="text-sm text-white/58">{glossary.terms} terms</p>
                  <p className="text-sm text-white/58">{glossary.locales} locales</p>
                  <div className="flex flex-col gap-2">
                    <ProgressBar value={glossary.coverage} tone={glossary.tone} />
                    <p className="text-xs text-white/42">{glossary.coverage}% coverage</p>
                  </div>
                </div>
                {index < glossaries.length - 1 ? <Separator className="bg-white/8" /> : null}
              </div>
            ))}
          </div>
        </ResourceCard>
        <ResourceCard
          title="Term review"
          description="Representative terms that localization jobs can enforce during drafting and evals."
          icon={BookOpenTextIcon}
        >
          <div className="overflow-x-auto">
            <div className="min-w-176">
              <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] gap-3 px-5 py-2 text-xs font-medium tracking-[0.08em] text-white/38 uppercase">
                <p>Source</p>
                <p>Approved term</p>
                <p>Locale</p>
                <p>Usage</p>
                <p>Status</p>
              </div>
              <Separator className="bg-white/8" />
              {glossaryTerms.map((term, index) => (
                <div key={`${term.locale}-${term.source}`}>
                  <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_minmax(8rem,1fr)_7rem] items-center gap-3 px-5 py-4">
                    <p className="truncate text-sm text-white">{term.source}</p>
                    <p className="truncate text-sm text-white/72">{term.approved}</p>
                    <p className="text-sm text-white/48">{term.locale}</p>
                    <p className="truncate text-sm text-white/58">{term.usage}</p>
                    <Badge variant="outline" className={cn("rounded-full", toneClass(term.tone))}>
                      {term.status}
                    </Badge>
                  </div>
                  {index < glossaryTerms.length - 1 ? <Separator className="bg-white/8" /> : null}
                </div>
              ))}
            </div>
          </div>
        </ResourceCard>
      </section>
    </div>
  );
}
