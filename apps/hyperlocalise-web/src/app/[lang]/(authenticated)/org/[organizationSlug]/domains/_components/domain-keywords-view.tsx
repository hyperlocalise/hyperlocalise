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
import { useDomainResearchCatalog } from "./domain-research-context";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  isLiveDomainResearchId,
  type DomainResearchCatalog,
  type KeywordIdea,
  type SerpResult,
} from "@/lib/domains/research-prototype";
import { cn } from "@/lib/primitives/cn";
import { formatKeywordIntent } from "./domain-research-format";
import { domainKeywordsViewMessages as shared } from "./domain-keywords-view.messages";
import { keywordScreenMessages as messages } from "./domain-keyword-screen.messages";
import { DomainKeywordAnalysis } from "./domain-keyword-analysis";
import {
  filterKeywordIdeas,
  keywordIdeasCsv,
  resolveActiveKeyword,
  type KeywordFilters,
  type KeywordSort,
} from "@/lib/domains/keyword-screen";
import { liveDomainResearchQueryKey } from "./use-live-domain-research";

const EMPTY_FILTERS: KeywordFilters = {
  include: "",
  exclude: "",
  minVolume: "",
  maxVolume: "",
  minKd: "",
  maxKd: "",
  minCpc: "",
  maxCpc: "",
  intent: "all",
};

export function DomainKeywordsView({
  linkedDomainId,
  organizationSlug,
}: {
  linkedDomainId: string;
  organizationSlug?: string;
}) {
  const catalog = useDomainResearchCatalog(linkedDomainId);
  const live = Boolean(organizationSlug && isLiveDomainResearchId(linkedDomainId));
  return catalog ? (
    <KeywordScreen
      key={`${linkedDomainId}-${catalog.market.id}`}
      catalog={catalog}
      linkedDomainId={linkedDomainId}
      organizationSlug={organizationSlug}
      live={live}
    />
  ) : null;
}

function KeywordScreen({
  catalog,
  linkedDomainId,
  organizationSlug,
  live,
}: {
  catalog: DomainResearchCatalog;
  linkedDomainId: string;
  organizationSlug?: string;
  live: boolean;
}) {
  const intl = useIntl();
  const t = intl.formatMessage;
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<KeywordSort>({ field: "volume", direction: "desc" });
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(catalog.keywords[0]?.id ?? null);
  const [ideas, setIdeas] = useState<KeywordIdea[] | null>(null);
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [seedKeyword, setSeedKeyword] = useState<string | undefined>();
  const [seedPending, setSeedPending] = useState(false);
  const [persistPending, setPersistPending] = useState(false);
  const [liveSerpResults, setLiveSerpResults] = useState<SerpResult[] | null>(null);
  const [serpKeywordId, setSerpKeywordId] = useState<string | null>(null);
  const [serpPending, setSerpPending] = useState(false);
  const market = catalog.market.id;
  const keywords = ideas && expandedMarketId === market ? ideas : catalog.keywords;
  const rows = filterKeywordIdeas(keywords, live ? "" : search, filters, sort);
  const active = resolveActiveKeyword(rows, activeId);
  const selectedRows = rows.filter((row) => selected.includes(row.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value !== "" && !(key === "intent" && value === "all"),
  ).length;
  const columns = [
    { field: "keyword", label: shared.columnKeyword },
    { field: "volume", label: shared.columnVolume, help: messages.volumeHelp },
    { field: "kd", label: shared.columnKd, help: messages.kdHelp },
    { field: "cpc", label: shared.columnCpc, help: messages.cpcHelp },
    { field: "competition", label: messages.competition, help: messages.competitionHelp },
  ] as const;
  const serpResults =
    live && serpKeywordId === active?.id && liveSerpResults
      ? liveSerpResults
      : active
        ? (catalog.serpByKeywordId[active.id] ?? [])
        : [];

  async function expandIdeas(seed: string, marketId: string) {
    if (!organizationSlug || !live) {
      toast.success(intl.formatMessage(shared.seedSuccess));
      return true;
    }
    setSeedPending(true);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/keywords/expand`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seedKeyword: seed, marketId }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        ideas?: KeywordIdea[];
        message?: string;
      };
      if (!response.ok || !body.ideas) {
        toast.error(body.message || intl.formatMessage(shared.seedError));
        return false;
      }
      setIdeas(body.ideas);
      setSelected([]);
      setExpandedMarketId(marketId);
      setSeedKeyword(seed);
      const nextActive = body.ideas[0] ?? null;
      setActiveId(nextActive?.id ?? null);
      if (nextActive) {
        void inspectSerp(nextActive, marketId);
      }
      toast.success(intl.formatMessage(shared.seedSuccess));
      return true;
    } finally {
      setSeedPending(false);
    }
  }

  async function inspectSerp(keyword: KeywordIdea, marketId = market) {
    setActiveId(keyword.id);
    const cached = catalog.serpByKeywordId[keyword.id];
    if (cached?.length) {
      setSerpKeywordId(keyword.id);
      setLiveSerpResults(cached);
      return;
    }
    if (!organizationSlug || !live) {
      setSerpKeywordId(keyword.id);
      setLiveSerpResults(null);
      return;
    }
    setSerpKeywordId(keyword.id);
    setSerpPending(true);
    setLiveSerpResults(null);
    try {
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/serp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: keyword.keyword, marketId }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        results?: SerpResult[];
        message?: string;
      };
      if (!response.ok || !body.results) {
        toast.error(body.message || intl.formatMessage(shared.serpError));
        return;
      }
      setLiveSerpResults(body.results);
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
    } finally {
      setSerpPending(false);
    }
  }

  async function persistSelected(path: "save" | "ranks") {
    if (!organizationSlug || !live) {
      toast.success(intl.formatMessage(path === "save" ? shared.saved : shared.sentToRanks));
      setSelected([]);
      return;
    }
    setPersistPending(true);
    const endpoint =
      path === "save"
        ? `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/keywords/save`
        : `/api/orgs/${encodeURIComponent(organizationSlug)}/linked-domains/${encodeURIComponent(linkedDomainId)}/research/ranks`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: expandedMarketId ?? market,
          seedKeyword,
          keywords: selectedRows.map((row) => ({
            keyword: row.keyword,
            volume: row.volume,
            kd: row.kd,
            cpc: row.cpc,
            intent: row.intent,
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(
          body.message ||
            intl.formatMessage(path === "save" ? shared.saveError : shared.ranksError),
        );
        return;
      }
      setSelected([]);
      setIdeas(null);
      setExpandedMarketId(null);
      await queryClient.invalidateQueries({
        queryKey: liveDomainResearchQueryKey(organizationSlug, linkedDomainId),
      });
      toast.success(intl.formatMessage(path === "save" ? shared.saved : shared.sentToRanks));
    } finally {
      setPersistPending(false);
    }
  }

  function exportCsv() {
    const csv = keywordIdeasCsv(selectedRows.length ? selectedRows : rows);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `keywords-${catalog.domain.domainKey}-${catalog.market.id}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() {
    setQuery("");
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSelected([]);
    setIdeas(null);
    setExpandedMarketId(null);
    setActiveId(catalog.keywords[0]?.id ?? null);
  }
  function metric(row: KeywordIdea, field: "volume" | "kd" | "cpc" | "competition") {
    const value = row[field];
    return value == null
      ? "—"
      : field === "cpc"
        ? intl.formatNumber(value, { style: "currency", currency: "EUR" })
        : intl.formatNumber(value, { maximumFractionDigits: 2 });
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextQuery = query.trim();
          if (live && nextQuery) {
            void expandIdeas(nextQuery, market);
            setSearch("");
            return;
          }
          setSearch(nextQuery);
          setActiveId(filterKeywordIdeas(keywords, nextQuery, filters, sort)[0]?.id ?? null);
          setSelected([]);
        }}
      >
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="keyword-query">{t(messages.query)}</FieldLabel>
          <Input
            id="keyword-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={catalog.keywords[0]?.keyword ?? t(messages.query)}
            disabled={seedPending}
          />
        </Field>
        <Button type="submit" disabled={seedPending}>
          {seedPending ? <Spinner className="size-3.5" /> : null}
          {t(messages.search)}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{t(live ? messages.live : messages.preview)}</p>
      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {active ? (
            <section
              className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border px-4 py-3"
              aria-label={active.keyword}
            >
              <div className="min-w-0">
                <h2 className="break-words text-base font-semibold">{active.keyword}</h2>
                <Badge variant="outline" className="mt-1">
                  {formatKeywordIntent(intl, active.intent)}
                </Badge>
              </div>
              <dl className="flex flex-wrap gap-4">
                {columns
                  .filter((col) => col.field !== "keyword")
                  .map((col) => (
                    <div key={col.field}>
                      <dt className="text-xs text-muted-foreground">{t(col.label)}</dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">
                        {metric(active, col.field as "volume" | "kd" | "cpc" | "competition")}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ) : null}
          <section className="min-w-0 overflow-hidden rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <Button
                size="sm"
                variant="outline"
                aria-expanded={showFilters}
                aria-controls="keyword-filters"
                onClick={() => setShowFilters(!showFilters)}
              >
                {t(messages.filters)}
                {activeFilterCount ? ` (${activeFilterCount})` : ""}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t(messages.results, { count: rows.length })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ms-auto"
                disabled={!rows.length}
                onClick={exportCsv}
              >
                {t(selectedRows.length ? messages.exportSelected : messages.export)}
              </Button>
            </div>
            {showFilters ? (
              <div
                id="keyword-filters"
                className="grid gap-3 border-b border-border bg-muted/20 p-4 sm:grid-cols-2"
              >
                {(
                  [
                    "include",
                    "exclude",
                    "minVolume",
                    "maxVolume",
                    "minKd",
                    "maxKd",
                    "minCpc",
                    "maxCpc",
                  ] as const
                ).map((name) => (
                  <Field key={name}>
                    <FieldLabel htmlFor={`keyword-${name}`}>{t(messages[name])}</FieldLabel>
                    <Input
                      id={`keyword-${name}`}
                      type={name === "include" || name === "exclude" ? "text" : "number"}
                      min={0}
                      step={name.endsWith("Cpc") ? "0.01" : "1"}
                      value={filters[name]}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, [name]: event.target.value }))
                      }
                    />
                  </Field>
                ))}
                <Field>
                  <FieldLabel htmlFor="keyword-intent">{t(shared.columnIntent)}</FieldLabel>
                  <Select
                    value={filters.intent}
                    items={[
                      { value: "all", label: t(messages.allIntents) },
                      ...(
                        ["informational", "commercial", "transactional", "navigational"] as const
                      ).map((intent) => ({
                        value: intent,
                        label: formatKeywordIntent(intl, intent),
                      })),
                    ]}
                    onValueChange={(value) => {
                      if (value) setFilters((current) => ({ ...current, intent: value }));
                    }}
                  >
                    <SelectTrigger id="keyword-intent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">{t(messages.allIntents)}</SelectItem>
                        {(
                          ["informational", "commercial", "transactional", "navigational"] as const
                        ).map((intent) => (
                          <SelectItem key={intent} value={intent}>
                            {formatKeywordIntent(intl, intent)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-end"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  {t(messages.clear)}
                </Button>
              </div>
            ) : null}
            {selectedRows.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
                <span className="text-xs">
                  {t(shared.selectedCount, { count: selectedRows.length })}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                    {t(messages.clearSelection)}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={persistPending}
                    onClick={() => {
                      void persistSelected("save");
                    }}
                  >
                    {t(shared.save)}
                  </Button>
                  <Button
                    size="sm"
                    disabled={persistPending}
                    onClick={() => {
                      void persistSelected("ranks");
                    }}
                  >
                    {t(shared.sendToRanks)}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">
                      <Checkbox
                        aria-label={t(messages.selectAll)}
                        checked={allSelected ? true : selectedRows.length ? "indeterminate" : false}
                        onCheckedChange={(checked) =>
                          setSelected(checked === true ? rows.map((row) => row.id) : [])
                        }
                      />
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.field}
                        className="whitespace-nowrap px-3 py-2 text-start"
                        aria-sort={
                          sort.field === col.field
                            ? sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          title={"help" in col ? t(col.help) : undefined}
                          className="py-2"
                          onClick={() =>
                            setSort({
                              field: col.field,
                              direction:
                                sort.field === col.field && sort.direction === "desc"
                                  ? "asc"
                                  : "desc",
                            })
                          }
                        >
                          {t(col.label)}{" "}
                          {sort.field === col.field ? (sort.direction === "asc" ? "↑" : "↓") : ""}
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-start">{t(shared.columnIntent)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn("hover:bg-muted/30", active?.id === row.id && "bg-muted/50")}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selected.includes(row.id)}
                          aria-label={t(shared.selectKeyword, { keyword: row.keyword })}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked === true
                                ? [...new Set([...current, row.id])]
                                : current.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td className="min-w-48 px-3 py-3">
                        <button
                          type="button"
                          aria-pressed={active?.id === row.id}
                          onClick={() => {
                            void inspectSerp(row);
                          }}
                          className="text-start font-medium underline-offset-4 hover:underline"
                        >
                          {row.keyword}
                        </button>
                      </td>
                      {(["volume", "kd", "cpc", "competition"] as const).map((field) => (
                        <td
                          key={field}
                          className="whitespace-nowrap px-3 py-3 text-end tabular-nums text-muted-foreground"
                        >
                          {metric(row, field)}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <Badge variant="outline">{formatKeywordIntent(intl, row.intent)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {t(
                    live && keywords.length === 0 && !search
                      ? shared.emptyDescription
                      : messages.noMatches,
                  )}
                </p>
                <Button size="sm" variant="outline" onClick={reset}>
                  {t(messages.resetSearch)}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
        <DomainKeywordAnalysis keyword={active} results={serpResults} loading={serpPending} />
      </div>
    </div>
  );
}
