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
import { leaderboardScoreTone } from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditLeaderboardEntry } from "@/lib/localisation-audit/store";
import { cn } from "@/lib/primitives/cn";

import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";
import { LocalisationAuditSiteMark } from "./localisation-audit-site-mark";

type LocalisationAuditLeaderboardProps = {
  locale: string;
  entries: LocalisationAuditLeaderboardEntry[];
};

const LEADERBOARD_GRID =
  "grid grid-cols-[1.75rem_minmax(0,11rem)_minmax(4.5rem,1fr)_2.75rem] items-center gap-x-3 sm:grid-cols-[2.25rem_minmax(12rem,18rem)_minmax(8rem,1fr)_3.5rem] sm:gap-x-5";

const SCORE_TICKS = [0, 25, 50, 75, 100] as const;

function scoreBarClass(score: number) {
  const tone = leaderboardScoreTone(score);
  if (tone === "safe") return "bg-success";
  if (tone === "watch") return "bg-warning";
  return "bg-destructive";
}

function scoreTextClass(score: number) {
  const tone = leaderboardScoreTone(score);
  if (tone === "safe") return "text-success";
  if (tone === "watch") return "text-warning";
  return "text-destructive";
}

function siteLabel(entry: LocalisationAuditLeaderboardEntry) {
  return entry.companyName ?? entry.domainKey;
}

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

      <div className="mt-10">
        <div
          className={cn(
            LEADERBOARD_GRID,
            "border-b border-border pb-3 text-xs font-medium text-muted-foreground uppercase",
          )}
        >
          <span className="col-span-2">{copy.leaderboardSiteColumn}</span>
          <span className="col-start-3 col-span-2">{copy.leaderboardScoreColumn}</span>
        </div>

        <ol className="divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.domainSlug}>
              <Link
                href={`/${locale}/localisation-audit/${entry.domainSlug}`}
                className={cn(
                  LEADERBOARD_GRID,
                  "py-3.5 transition-colors hover:bg-muted/40 sm:py-4",
                )}
              >
                <span className="text-sm tabular-nums text-muted-foreground">#{entry.rank}</span>
                <span className="flex min-w-0 items-center gap-3">
                  <LocalisationAuditSiteMark
                    domainKey={entry.domainKey}
                    companyName={entry.companyName}
                    logoUrl={entry.logoUrl}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{siteLabel(entry)}</span>
                    {entry.companyName ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.domainKey}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="min-w-0">
                  <span
                    className="relative block h-3 overflow-hidden rounded-sm bg-muted"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={entry.score}
                    aria-label={copy.leaderboardScoreLabel({ score: entry.score })}
                  >
                    <span
                      className={cn(
                        "block h-full w-full origin-left rounded-sm",
                        scoreBarClass(entry.score),
                      )}
                      style={{
                        transform: `scaleX(${Math.min(Math.max(entry.score, 0), 100) / 100})`,
                      }}
                    />
                  </span>
                </span>
                <span
                  className={cn(
                    "text-right text-sm font-semibold tabular-nums",
                    scoreTextClass(entry.score),
                  )}
                >
                  {entry.score}
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <div className={cn(LEADERBOARD_GRID, "pt-2")} aria-hidden>
          <div className="col-start-3 flex justify-between text-xs tabular-nums text-muted-foreground">
            {SCORE_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
