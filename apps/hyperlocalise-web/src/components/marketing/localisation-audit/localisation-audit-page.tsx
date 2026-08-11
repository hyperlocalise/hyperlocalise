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
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { TypographyH1, TypographyH2, TypographyP } from "@/components/ui/typography";
import type { LocalisationAuditLeaderboardEntry } from "@/lib/localisation-audit/store";

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
            <TypographyP className="text-lg text-muted-foreground">{copy.subcopy}</TypographyP>
          </div>
          <LocalisationAuditForm locale={locale} />
        </section>

        <LocalisationAuditLeaderboard locale={locale} entries={leaderboard} />

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <TypographyH2 className="pb-0">{copy.methodologyHeading}</TypographyH2>
          <div className="mt-8 grid gap-10 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Technical
              </p>
              <ul className="mt-4 space-y-3 text-muted-foreground">
                {copy.technicalChecks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Linguistic
              </p>
              <ul className="mt-4 space-y-3 text-muted-foreground">
                {copy.linguisticChecks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <TypographyP className="mt-10 max-w-3xl text-muted-foreground">
            {copy.crawlLimits}
          </TypographyP>
          <TypographyP className="mt-4 max-w-3xl text-muted-foreground">
            {copy.privacyNote}
          </TypographyP>
          <TypographyP className="mt-4 max-w-3xl text-muted-foreground">
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
