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
import Link from "next/link";

import { TypographyH2, TypographyP } from "@/components/ui/typography";
import type { LocalisationAuditLeaderboardEntry } from "@/lib/localisation-audit/store";

import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";

type LocalisationAuditLeaderboardProps = {
  locale: string;
  entries: LocalisationAuditLeaderboardEntry[];
};

export function LocalisationAuditLeaderboard({
  locale,
  entries,
}: LocalisationAuditLeaderboardProps) {
  const copy = getLocalisationAuditPageCopy(locale);

  if (entries.length === 0) {
    return (
      <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
        <TypographyH2 className="pb-0">{copy.leaderboardHeading}</TypographyH2>
        <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
          {copy.leaderboardEmpty}
        </TypographyP>
      </section>
    );
  }

  return (
    <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
      <TypographyH2 className="pb-0">{copy.leaderboardHeading}</TypographyH2>
      <TypographyP className="mt-4 max-w-2xl text-muted-foreground">
        {copy.leaderboardSubcopy}
      </TypographyP>

      <ol className="mt-10 divide-y divide-border border-y border-border">
        {entries.map((entry) => (
          <li key={entry.domainSlug}>
            <Link
              href={`/${locale}/localisation-audit/${entry.domainSlug}`}
              className="flex items-baseline justify-between gap-6 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 items-baseline gap-4">
                <span className="w-8 shrink-0 text-sm tabular-nums text-muted-foreground">
                  #{entry.rank}
                </span>
                <span className="truncate font-medium">{entry.domainKey}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {entry.score}
                <span className="text-muted-foreground/70">/100</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
