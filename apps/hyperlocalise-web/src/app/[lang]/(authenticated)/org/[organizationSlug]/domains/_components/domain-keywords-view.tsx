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
import { useIntl } from "react-intl";
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
import { type DomainResearchCatalog, type KeywordIdea } from "@/lib/domains/research-prototype";
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

export function DomainKeywordsView({ linkedDomainId }: { linkedDomainId: string }) {
  const catalog = useDomainResearchCatalog(linkedDomainId);
  return catalog ? (
    <KeywordScreen key={`${linkedDomainId}-${catalog.market.id}`} catalog={catalog} />
  ) : null;
}

function KeywordScreen({ catalog }: { catalog: DomainResearchCatalog }) {
  const intl = useIntl();
  const t = intl.formatMessage;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<KeywordSort>({ field: "volume", direction: "desc" });
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(catalog.keywords[0]?.id ?? null);
  const keywords = catalog.keywords;
  const rows = filterKeywordIdeas(keywords, search, filters, sort);
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
          setSearch(query.trim());
          setActiveId(filterKeywordIdeas(keywords, query, filters, sort)[0]?.id ?? null);
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
          />
        </Field>
        <Button type="submit">{t(messages.search)}</Button>
      </form>
      <p className="text-xs text-muted-foreground">{t(messages.preview)}</p>
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
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
                <span className="text-xs">
                  {t(shared.selectedCount, { count: selectedRows.length })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  {t(messages.clearSelection)}
                </Button>
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
                          onClick={() => setActiveId(row.id)}
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
                <p className="text-sm text-muted-foreground">{t(messages.noMatches)}</p>
                <Button size="sm" variant="outline" onClick={reset}>
                  {t(messages.resetSearch)}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
        <DomainKeywordAnalysis
          keyword={active}
          results={active ? (catalog.serpByKeywordId[active.id] ?? []) : []}
        />
      </div>
    </div>
  );
}
