"use client";

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
import { useIntl } from "react-intl";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import type { KeywordIdea, SerpResult } from "@/lib/domains/research-prototype";
import { keywordScreenMessages as messages } from "./domain-keyword-screen.messages";
import { domainKeywordsViewMessages as shared } from "./domain-keywords-view.messages";

export function DomainKeywordAnalysis({
  keyword,
  results,
  loading = false,
}: {
  keyword: KeywordIdea | null;
  results: SerpResult[];
  loading?: boolean;
}) {
  const intl = useIntl();
  const t = intl.formatMessage;
  const history = keyword?.monthlySearches ?? [];
  return (
    <aside className="flex min-w-0 flex-col gap-4" aria-label={t(messages.serp)}>
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">{t(messages.trends)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {keyword?.keyword ?? t(messages.chooseKeyword)}
        </p>
        {history.length ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              {history[0]?.month} – {history.at(-1)?.month}
            </p>
            <ChartContainer
              className="mt-4 h-52 w-full"
              config={{ volume: { label: t(shared.columnVolume), color: "var(--primary)" } }}
            >
              <LineChart
                data={history}
                accessibilityLayer
                margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(month: string) =>
                    intl.formatDate(new Date(`${month}-01T00:00:00Z`), {
                      month: "short",
                      timeZone: "UTC",
                    })
                  }
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={42}
                  tickFormatter={(value: number) =>
                    intl.formatNumber(value, { notation: "compact" })
                  }
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="volume"
                  type="linear"
                  stroke="var(--color-volume)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </>
        ) : (
          <p className="flex min-h-40 items-center text-sm text-muted-foreground">
            {t(messages.noTrend)}
          </p>
        )}
      </section>
      <section className="rounded-lg border border-border">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold">{t(messages.serp)}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {keyword?.keyword ?? t(messages.chooseKeyword)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(messages.organicResults, { count: results.length })}
          </p>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">{t(shared.serpLoading)}</p>
        ) : results.length ? (
          <ol className="divide-y divide-border px-4">
            {results.map((result) => (
              <li key={result.url} className="flex gap-3 py-4">
                <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {result.position}
                </span>
                <div className="min-w-0">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {result.title}
                  </a>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {new URL(result.url).hostname}
                  </p>
                  {result.isOwn ? (
                    <Badge variant="outline" className="mt-2">
                      {t(shared.ownResult)}
                    </Badge>
                  ) : null}
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {result.snippet}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t(shared.serpEmpty)}</p>
        )}
      </section>
    </aside>
  );
}
