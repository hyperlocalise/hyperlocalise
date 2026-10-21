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
"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { reportMessages as messages } from "./reports.messages";
import { MATCH_BUCKETS } from "@/lib/reporting/word-analysis";
import type { ReportRow } from "@/lib/reporting/query";
import { TaskReportingPanel } from "./task-reporting-panel";
import { WordCountTotals } from "./word-count-totals";

type Label = keyof typeof messages;

/** Typed filters wait this long after the last keystroke before the report is requested again. */
const FILTER_DEBOUNCE_MS = 400;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debouncedValue;
}
type Rate = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocale: string;
  step: string;
  basis: string;
  rate: string;
};
type Budget = {
  projectId: string;
  budget: string;
  accruedUsd: string;
  outstandingUsd: string;
  forecastUsd: string;
  remainingUsd: string;
  incomplete: boolean;
  spendWarning: "none" | "approaching" | "exceeded";
  forecastWarning: "none" | "approaching" | "exceeded";
};
type Settings = {
  projects: { id: string; name: string; targetLocales: string[] | null }[];
  rates: Rate[];
  budgets: Budget[];
  financial: boolean;
  canManage: boolean;
};
export async function reportingFetch<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("report_request_failed");
  return response.json() as Promise<T>;
}
export function ReportingForm({
  title,
  endpoint,
  fields,
  defaults = {},
  method = "POST",
  percentages = false,
  options = {},
}: {
  title: Label;
  endpoint: string;
  fields: Label[];
  defaults?: Record<string, string>;
  method?: string;
  percentages?: boolean;
  options?: Partial<Record<Label, { value: string; label: string }[]>>;
}) {
  const intl = useIntl(),
    queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const label = (key: Label) => intl.formatMessage(messages[key]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const expenseKey = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setErrorCode(null);
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { ...defaults };
    for (const key of fields) {
      const raw = data.get(key);
      const value = typeof raw === "string" ? raw : "";
      if (["minutes", "estimatedMinutes"].includes(key)) body[key] = value ? Number(value) : null;
      else if (["rateId", "overrideUsd", "rateCardName"].includes(key)) body[key] = value || null;
      else if (value) body[key] = value;
    }
    if (percentages)
      body.percentages = Object.fromEntries(
        MATCH_BUCKETS.filter((bucket) => bucket !== "unavailable").map((bucket) => [
          bucket,
          Number(data.get("percent-" + bucket) ?? 100),
        ]),
      );
    if (title === "expenseForm") body.operationKey = expenseKey.current;
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setErrorCode(body.error ?? null);
        throw new Error("report_save_failed");
      }
      if (title === "expenseForm") expenseKey.current = crypto.randomUUID();
      setState("saved");
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    } catch {
      setState("error");
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label(title)}</CardTitle>
        {title === "rateForm" ? <CardDescription>{label("pricingHelp")}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup>
            {fields.map((key) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${title}-${key}`}>{label(key)}</FieldLabel>
                {options[key] ? (
                  <select
                    id={`${title}-${key}`}
                    name={key}
                    defaultValue={defaults[key] ?? ""}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {options[key]!.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`${title}-${key}`}
                    name={key}
                    defaultValue={defaults[key] ?? ""}
                    type={
                      key === "workDate"
                        ? "date"
                        : [
                              "minutes",
                              "estimatedMinutes",
                              "rate",
                              "budget",
                              "amountUsd",
                              "overrideUsd",
                            ].includes(key)
                          ? "number"
                          : "text"
                    }
                    min={key === "minutes" ? 1 : 0}
                    step={["minutes", "estimatedMinutes"].includes(key) ? 1 : "any"}
                    required={
                      ![
                        "estimatedMinutes",
                        "overrideUsd",
                        "rateId",
                        "rateCardName",
                        "note",
                      ].includes(key)
                    }
                  />
                )}
              </Field>
            ))}
            {percentages
              ? MATCH_BUCKETS.filter((bucket) => bucket !== "unavailable").map((bucket) => (
                  <Field key={bucket}>
                    <FieldLabel htmlFor={`percent-${bucket}`}>{label(bucket)} (%)</FieldLabel>
                    <Input
                      id={`percent-${bucket}`}
                      name={`percent-${bucket}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      defaultValue={100}
                    />
                  </Field>
                ))
              : null}
          </FieldGroup>
          <Button type="submit" disabled={state === "saving"}>
            {label("save")}
          </Button>
          {state === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {label(errorCode === "task_rate_locked" ? "taskRateLocked" : "saveError")}
            </p>
          ) : state === "saved" ? (
            <p role="status" className="text-sm">
              {label("saved")}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
export function ReportsWorkspace({
  organizationSlug,
  projectId: initialProject = "",
  jobId: initialJob = "",
}: {
  organizationSlug: string;
  projectId?: string;
  jobId?: string;
}) {
  const intl = useIntl();
  const label = (key: Label) => intl.formatMessage(messages[key]);
  const base = `/api/orgs/${encodeURIComponent(organizationSlug)}/reports`;
  const [view, setView] = useState("overview");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    projectId: initialProject,
    jobId: initialJob,
    targetLocale: "",
    step: "",
    interval: "week",
  });
  const appliedFilters = useDebouncedValue(filters, FILTER_DEBOUNCE_MS);
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)),
    view,
  });
  const csvParams = new URLSearchParams(params);
  csvParams.set("format", "csv");
  params.set("page", String(page));
  const updateFilter = (key: keyof typeof filters, value: string) => {
    // A task belongs to one project, so changing the project clears the task.
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "projectId" ? { jobId: "" } : {}),
    }));
    setPage(1);
  };
  const settings = useQuery({
    queryKey: ["reports", organizationSlug, "settings"],
    queryFn: () => reportingFetch<{ settings: Settings }>(base + "/settings"),
  });
  const report = useQuery({
    queryKey: ["reports", organizationSlug, params.toString()],
    queryFn: () =>
      reportingFetch<{
        report: {
          rows: ReportRow[];
          analysis?: { sourceWords: number; workloadWords: number; completedWords: number };
          startedAt: string | null;
          financial: boolean;
          page: number;
          hasMore: boolean;
        };
      }>(base + "?" + params),
  });
  const rows = report.data?.report.rows ?? [];
  const financial = settings.data?.settings.financial ?? false;
  const canManage = settings.data?.settings.canManage ?? false;
  const projectOptions = (settings.data?.settings.projects ?? []).map((project) => ({
    value: project.id,
    label: project.name,
  }));
  const jobs = useQuery({
    queryKey: ["reports", organizationSlug, "jobs", appliedFilters.projectId],
    queryFn: () =>
      reportingFetch<{
        jobs: { id: string; title: string; projectId: string | null; createdAt: string }[];
      }>(
        `${base}/jobs${appliedFilters.projectId ? `?projectId=${encodeURIComponent(appliedFilters.projectId)}` : ""}`,
      ),
  });
  const jobTitleById = new Map((jobs.data?.jobs ?? []).map((job) => [job.id, job.title]));
  // Tasks often share a name, so the picker adds when each one started.
  const jobOptions = (jobs.data?.jobs ?? []).map((job) => ({
    value: job.id,
    label: `${job.title} · ${intl.formatDate(job.createdAt, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
  }));
  if (filters.jobId && !jobTitleById.has(filters.jobId)) {
    jobOptions.unshift({ value: filters.jobId, label: filters.jobId });
  }
  const languageOptions = [
    ...new Set(
      (settings.data?.settings.projects ?? [])
        .filter((project) => !filters.projectId || project.id === filters.projectId)
        .flatMap((project) => project.targetLocales ?? []),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((locale) => ({ value: locale, label: locale }));
  // The cards count one step at a time, so a word translated and then reviewed is not counted twice.
  const cardStepDescription = intl.formatMessage(messages.cardStep, {
    step: label(appliedFilters.step === "review" ? "review" : "translation"),
  });
  const stepOptions = ["translation", "review"].map((value) => ({
    value,
    label: label(value as Label),
  }));
  const commonOptions = { projectId: projectOptions, step: stepOptions };
  const columns: (keyof ReportRow)[] =
    view === "words"
      ? ["period", "projectId", "jobId", "targetLocale", "step", "bucket", "words", "unavailable"]
      : view === "time"
        ? ["period", "projectId", "jobId", "step", "minutes", "durationMs"]
        : view === "costs"
          ? [
              "period",
              "projectId",
              "jobId",
              "targetLocale",
              "step",
              "kind",
              "amountUsd",
              "unavailable",
            ]
          : [
              "period",
              "projectId",
              "targetLocale",
              "step",
              "kind",
              "words",
              "minutes",
              "inputTokens",
              "outputTokens",
            ];
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-balance text-2xl font-semibold">{label("title")}</h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">{label("prospective")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.data?.report.startedAt
              ? intl.formatMessage(messages.started, {
                  date: intl.formatDate(report.data.report.startedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })
              : label("notStarted")}
          </p>
        </div>
        <Button nativeButton={false} render={<a href={base + "?" + csvParams} />} variant="outline">
          {label("export")}
        </Button>
      </div>
      <FieldGroup className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["from", "to", "projectId", "jobId", "targetLocale", "step", "interval"] as const).map(
          (key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`filter-${key}`}>
                {label(key === "jobId" ? "task" : key)}
              </FieldLabel>
              {["projectId", "jobId", "targetLocale", "step", "interval"].includes(key) ? (
                <select
                  id={`filter-${key}`}
                  value={filters[key]}
                  onChange={(event) => updateFilter(key, event.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {key !== "interval" ? <option value="">{label("all")}</option> : null}
                  {(key === "projectId"
                    ? projectOptions
                    : key === "jobId"
                      ? jobOptions
                      : key === "targetLocale"
                        ? languageOptions
                        : key === "step"
                          ? stepOptions
                          : [
                              { value: "day", label: label("day") },
                              { value: "week", label: label("week") },
                            ]
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`filter-${key}`}
                  type="date"
                  value={filters[key]}
                  onChange={(event) => updateFilter(key, event.target.value)}
                />
              )}
            </Field>
          ),
        )}
      </FieldGroup>
      {report.data?.report.analysis ? (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{label("sourceWords")}</CardTitle>
              <CardDescription>{cardStepDescription}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl tabular-nums">
              {intl.formatNumber(report.data.report.analysis.sourceWords)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{label("workloadWords")}</CardTitle>
              <CardDescription>{cardStepDescription}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl tabular-nums">
              {intl.formatNumber(report.data.report.analysis.completedWords)}
            </CardContent>
          </Card>
        </div>
      ) : null}
      {filters.targetLocale ? (
        <p className="text-sm text-muted-foreground">{label("allocationHelp")}</p>
      ) : null}
      <Tabs
        value={view}
        onValueChange={(value) => {
          setView(String(value));
          setPage(1);
        }}
      >
        <TabsList>
          {(["overview", "words", "time", ...(financial ? ["costs"] : [])] as Label[]).map(
            (key) => (
              <TabsTrigger value={key} key={key}>
                {label(key)}
              </TabsTrigger>
            ),
          )}
        </TabsList>
      </Tabs>
      {report.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : report.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {label("error")}
            <Button variant="outline" onClick={() => void report.refetch()}>
              {label("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <p className="py-10 text-pretty text-sm text-muted-foreground">{label("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((key) => (
                <TableHead key={key}>{label(key === "jobId" ? "task" : (key as Label))}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((key) => (
                  <TableCell className="tabular-nums" key={key}>
                    {key === "projectId"
                      ? (settings.data?.settings.projects.find(
                          (project) => project.id === row.projectId,
                        )?.name ??
                        row.projectId ??
                        "—")
                      : key === "jobId"
                        ? row.jobId
                          ? (jobTitleById.get(row.jobId) ?? row.jobId)
                          : "—"
                        : key === "amountUsd"
                          ? row.amountUsd === null
                            ? label("unknownCost")
                            : intl.formatNumber(Number(row.amountUsd), {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 6,
                              })
                          : ["kind", "step", "bucket"].includes(key) &&
                              row[key] &&
                              row[key] in messages
                            ? label(row[key] as Label)
                            : key === "targetLocale" &&
                                row.targetLocale === null &&
                                ["ai", "human", "expense"].includes(row.kind)
                              ? label("unallocated")
                              : (row[key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {page > 1 || report.data?.report.hasMore ? (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || report.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {label("previousPage")}
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {intl.formatMessage(messages.pageNumber, { page })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!report.data?.report.hasMore || report.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            {label("nextPage")}
          </Button>
        </div>
      ) : null}
      {view === "words" ? (
        <WordCountTotals
          base={base}
          filters={{
            from: appliedFilters.from,
            to: appliedFilters.to,
            projectId: appliedFilters.projectId,
            targetLocale: appliedFilters.targetLocale,
            step: appliedFilters.step,
          }}
        />
      ) : null}
      {appliedFilters.jobId ? (
        <TaskReportingPanel base={base} jobId={appliedFilters.jobId} />
      ) : null}
      {view === "time" ? (
        <ReportingForm
          title="timeForm"
          endpoint={base + "/time-entries"}
          fields={["jobId", "targetLocale", "step", "workDate", "minutes", "note"]}
          defaults={{ jobId: filters.jobId, workDate: new Date().toISOString().slice(0, 10) }}
          options={commonOptions}
        />
      ) : null}
      {financial && view === "costs" ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  [
                    "projectId",
                    "budget",
                    "accruedUsd",
                    "outstandingUsd",
                    "forecastUsd",
                    "remainingUsd",
                    "spendWarning",
                    "forecastWarning",
                  ] as Label[]
                ).map((key) => (
                  <TableHead key={key}>{label(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.data?.settings.budgets
                .filter((budget) => !filters.projectId || budget.projectId === filters.projectId)
                .map((budget) => (
                  <TableRow key={budget.projectId}>
                    <TableCell>
                      {projectOptions.find((option) => option.value === budget.projectId)?.label}
                    </TableCell>
                    {(
                      [
                        "budget",
                        "accruedUsd",
                        "outstandingUsd",
                        "forecastUsd",
                        "remainingUsd",
                      ] as const
                    ).map((key) => (
                      <TableCell className="tabular-nums" key={key}>
                        {intl.formatNumber(Number(budget[key]), {
                          style: "currency",
                          currency: "USD",
                        })}
                        {budget.incomplete && key === "forecastUsd" ? (
                          <p>{label("incomplete")}</p>
                        ) : null}
                      </TableCell>
                    ))}
                    <TableCell>{label(budget.spendWarning)}</TableCell>
                    <TableCell>{label(budget.forecastWarning)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {canManage ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ReportingForm
                title="budgetForm"
                endpoint={base + "/budgets"}
                method="PUT"
                fields={["projectId", "budget", "rateCardName"]}
                options={commonOptions}
                defaults={{ projectId: filters.projectId }}
              />
              <ReportingForm
                title="rateForm"
                endpoint={base + "/rates"}
                fields={["name", "sourceLocale", "targetLocale", "step", "basis", "rate"]}
                percentages
                options={{
                  ...commonOptions,
                  basis: [
                    { value: "word", label: label("word") },
                    { value: "hour", label: label("hour") },
                  ],
                }}
              />
              <ReportingForm
                title="taskRateForm"
                endpoint={base + "/task-rates"}
                method="PUT"
                fields={["jobId", "step", "rateId", "estimatedMinutes", "overrideUsd"]}
                defaults={{ jobId: filters.jobId }}
                options={{
                  ...commonOptions,
                  rateId: [
                    { value: "", label: label("all") },
                    ...(settings.data?.settings.rates ?? []).map((rate) => ({
                      value: rate.id,
                      label: `${rate.name} · ${rate.sourceLocale} → ${rate.targetLocale} · ${rate.step} · $${rate.rate}/${rate.basis}`,
                    })),
                  ],
                }}
              />
              <ReportingForm
                title="expenseForm"
                endpoint={base + "/expenses"}
                fields={["projectId", "step", "amountUsd", "note"]}
                options={commonOptions}
                defaults={{ projectId: filters.projectId }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
