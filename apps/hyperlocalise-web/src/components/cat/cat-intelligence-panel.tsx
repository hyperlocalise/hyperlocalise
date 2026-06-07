"use client";

import type { ReactNode } from "react";
import { BulbIcon, Copy01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/primitives/cn";

import { catToneClass, riskLevelTone } from "./cat-tone";
import type { CatSegmentIntelligence } from "./types";

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-foreground/8 bg-foreground/2 px-2.5 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/82">
          {value}
        </code>
        <Button variant="ghost" size="icon-sm" aria-label={`Copy ${label}`}>
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function IntelligenceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CatIntelligencePanel({ intelligence }: { intelligence: CatSegmentIntelligence }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-foreground/8 bg-background">
      <div className="flex items-center gap-2 border-b border-foreground/8 px-4 py-3">
        <HugeiconsIcon icon={BulbIcon} className="size-4 text-bud-300" />
        <h2 className="text-sm font-semibold text-foreground">Translation Intelligence</h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          {intelligence.reviewReason ? (
            <IntelligenceSection title="Why this needs review">
              <p className="text-sm text-foreground/85">{intelligence.reviewReason}</p>
              {intelligence.reviewRisk ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full",
                    catToneClass(riskLevelTone(intelligence.reviewRisk)),
                  )}
                >
                  {intelligence.reviewRisk} risk
                </Badge>
              ) : null}
            </IntelligenceSection>
          ) : null}

          {intelligence.intent ? (
            <IntelligenceSection title="Intent">
              <p className="text-sm text-foreground/85">{intelligence.intent}</p>
            </IntelligenceSection>
          ) : null}

          {intelligence.locationBreadcrumb ||
          intelligence.filePath ||
          intelligence.componentName ? (
            <IntelligenceSection title="Where it appears">
              {intelligence.locationBreadcrumb ? (
                <p className="text-sm text-foreground/85">{intelligence.locationBreadcrumb}</p>
              ) : null}
              {intelligence.filePath ? (
                <CopyableField label="File" value={intelligence.filePath} />
              ) : null}
              {intelligence.componentName ? (
                <CopyableField label="Component" value={intelligence.componentName} />
              ) : null}
            </IntelligenceSection>
          ) : null}

          {intelligence.productMeaning ? (
            <IntelligenceSection title="Product meaning">
              <p className="text-sm text-foreground/85">{intelligence.productMeaning}</p>
            </IntelligenceSection>
          ) : null}

          {intelligence.glossaryTerms.length > 0 ? (
            <IntelligenceSection title="Approved terms (Glossary)">
              <div className="overflow-hidden rounded-lg border border-foreground/8">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-foreground/8 bg-foreground/3">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Source</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/8">
                    {intelligence.glossaryTerms.map((term) => (
                      <tr key={term.id}>
                        <td className="px-3 py-2 text-foreground/85">{term.source}</td>
                        <td className="px-3 py-2 text-foreground/85">
                          <span className="inline-flex items-center gap-1.5">
                            {term.target}
                            {term.approved ? (
                              <span className="text-grove-300" aria-label="Approved">
                                ✓
                              </span>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </IntelligenceSection>
          ) : null}

          {intelligence.reviewerPreference ? (
            <IntelligenceSection title="Reviewer preference">
              <p className="text-sm text-foreground/85">{intelligence.reviewerPreference}</p>
            </IntelligenceSection>
          ) : null}

          {intelligence.constraints ? (
            <IntelligenceSection title="Constraints">
              <p className="text-sm text-foreground/85">{intelligence.constraints}</p>
            </IntelligenceSection>
          ) : null}

          {intelligence.qaRisks.length > 0 ? (
            <IntelligenceSection title="QA risks">
              <div className="overflow-hidden rounded-lg border border-foreground/8">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-foreground/8 bg-foreground/3">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Risk</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/8">
                    {intelligence.qaRisks.map((risk) => (
                      <tr key={risk.id}>
                        <td className="px-3 py-2 text-foreground/85">{risk.label}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px] capitalize",
                              catToneClass(riskLevelTone(risk.level)),
                            )}
                          >
                            {risk.level}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </IntelligenceSection>
          ) : null}

          {intelligence.githubEvidence && intelligence.githubEvidence.length > 0 ? (
            <IntelligenceSection title="GitHub evidence">
              <ul className="space-y-2">
                {intelligence.githubEvidence.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className="inline-flex items-center gap-1.5 text-sm text-dew-100 hover:underline"
                    >
                      <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </IntelligenceSection>
          ) : null}

          {intelligence.relatedStringCount ? (
            <>
              <Separator />
              <Button variant="link" className="h-auto p-0 text-sm">
                {intelligence.relatedStringCount} related strings in this flow
              </Button>
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
