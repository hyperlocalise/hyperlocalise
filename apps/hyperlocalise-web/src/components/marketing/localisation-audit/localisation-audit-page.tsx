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
import { MeshStage, SAGE_MESH_GRADIENT_SRC } from "@/components/marketing/hero-frame-mesh-stage";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { TypographyH1, TypographyH2, TypographyH3, TypographyP } from "@/components/ui/typography";
import type { LocalisationAuditLeaderboardEntry } from "@/lib/localisation-audit/store";
import { LOCALISATION_AUDIT_USER_AGENT } from "@/lib/localisation-audit/user-agent";

import { LocalisationAuditForm } from "./localisation-audit-form";
import { LocalisationAuditLeaderboard } from "./localisation-audit-leaderboard";
import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";

type LocalisationAuditPageProps = {
  locale: string;
  leaderboard: LocalisationAuditLeaderboardEntry[];
};

export function LocalisationAuditPage({ locale, leaderboard }: LocalisationAuditPageProps) {
  const copy = getLocalisationAuditPageCopy(locale);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="px-5 pt-16 pb-20 sm:px-8 sm:pt-20 sm:pb-24 lg:px-10">
          <div className="max-w-3xl space-y-5">
            <TypographyH1>{copy.headline}</TypographyH1>
            <TypographyP className="max-w-2xl sm:text-xl" size="large" tone="subtle">
              {copy.subcopy}
            </TypographyP>
          </div>
          <MeshStage
            className="mt-10 max-w-2xl"
            meshSrc={SAGE_MESH_GRADIENT_SRC}
            contentClassName="p-0"
            priority
          >
            <div className="relative">
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65"
                aria-hidden
              />
              <div className="relative p-6 sm:p-8 lg:p-10">
                <LocalisationAuditForm locale={locale} tone="mesh" />
              </div>
            </div>
          </MeshStage>
        </section>

        <LocalisationAuditLeaderboard locale={locale} entries={leaderboard} />

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <TypographyH2 className="pb-0">{copy.methodologyHeading}</TypographyH2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {copy.notices.map((notice) => (
              <div key={notice.title} className="space-y-3">
                <TypographyH3 className="pb-0 md:text-2xl" size="xlarge">
                  {notice.title}
                </TypographyH3>
                <p className="max-w-sm text-muted-foreground">{notice.body}</p>
              </div>
            ))}
          </div>
          <aside
            aria-labelledby="localisation-audit-crawl-note"
            className="mt-12 max-w-2xl space-y-2 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground"
          >
            <h3
              id="localisation-audit-crawl-note"
              className="text-balance font-medium text-foreground"
            >
              {copy.crawlAccessNoteHeading}
            </h3>
            <p className="text-pretty">{copy.crawlAccessNoteBody}</p>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span>{copy.crawlAccessNoteUserAgent}:</span>
              <code className="break-all rounded bg-black/10 px-1.5 py-0.5 text-xs text-foreground">
                {LOCALISATION_AUDIT_USER_AGENT}
              </code>
            </p>
          </aside>
          <TypographyP className="mt-12 max-w-2xl" tone="subtle">
            {copy.scopeNote}
          </TypographyP>
          <TypographyP className="mt-3 max-w-2xl" tone="subtle">
            {copy.disclosure}
          </TypographyP>
          <div className="mt-10 max-w-2xl rounded-xl border border-border bg-muted/30 p-6">
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {copy.sampleFindingTitle}
            </p>
            <p className="mt-3 text-foreground">{copy.sampleFindingBody}</p>
          </div>
        </section>

        <MarketingFooter columns={footerColumns} />
      </div>
    </div>
  );
}
