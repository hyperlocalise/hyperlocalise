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

import { FunnelSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_CHANNELS,
  AI_KEY_TYPES,
  AI_ORIGINS,
  type AiChannel,
  type AiKeyType,
  type AiOrigin,
} from "@/lib/reporting/ai-usage-origins";
import { REPORT_STEPS } from "@/lib/reporting/report-units";

import { channelLabel, dimensionLabel, keyTypeLabel, originLabel } from "./ai-usage-labels";
import { aiUsageTabMessages as aiMessages } from "./ai-usage-tab.messages";
import { cn } from "@/lib/primitives/cn";

import { stepLabel } from "./report-format";
import { REPORT_PILL } from "./report-pill";
import { ReportsDateRange } from "./reports-date-range";
import { reportsPageMessages as messages } from "./reports-page.messages";
import {
  useReportSettings,
  useReportTasks,
  type ReportSettings,
  type ReportTask,
} from "./reports-queries";
import {
  DEFAULT_REPORTS_STATE,
  MAX_ESTIMATE_TASKS,
  type ReportsTab,
  type ReportsUrlState,
} from "./reports-url-state";

/** Which filters each tab uses; the bar shows only those. */
const TAB_FILTERS: Record<
  ReportsTab,
  {
    dates?: true;
    task?: "one" | "many";
    language?: true;
    step?: true;
    rateCard?: true;
    ai?: true;
  }
> = {
  activity: { dates: true, task: "one", language: true },
  words: { dates: true, task: "one", language: true, step: true },
  contributors: { dates: true, task: "one", language: true, step: true },
  time: { dates: true, task: "one", language: true },
  ai: { dates: true, task: "one", ai: true },
  costs: { dates: true, language: true },
  estimate: { task: "many", language: true, rateCard: true },
  budgets: {},
};

const ALL = "__all__";

export function ReportsFilterBar({
  organizationSlug,
  tab,
  state,
  settings,
  fixedProjectId,
  onChange,
  onOpenRates,
  leading,
}: {
  organizationSlug: string;
  tab: ReportsTab;
  state: ReportsUrlState;
  settings: ReportSettings;
  /** On a project's own Reports page the project is fixed and its filter hidden. */
  fixedProjectId?: string;
  onChange: (change: Partial<ReportsUrlState>) => void;
  onOpenRates: () => void;
  /** Shown first in the bar: the tab's own reports to switch between. */
  leading?: React.ReactNode;
}) {
  const intl = useIntl();
  const filters = TAB_FILTERS[tab];
  const projects = settings.projects;
  const languages = useMemo(() => {
    const chosen = projects.filter((project) => !state.projectId || project.id === state.projectId);
    return [...new Set(chosen.flatMap((project) => project.targetLocales ?? []))].sort();
  }, [projects, state.projectId]);

  const projectLabel = intl.formatMessage(messages.project);
  const taskLabel = intl.formatMessage(messages.task);
  const chosenTask = useReportTasks({
    organizationSlug,
    projectId: null,
    ids: state.jobId ? [state.jobId] : [],
    enabled: filters.task === "one" && Boolean(state.jobId),
  });

  // Every filter sits behind one button; the chosen ones show as chips below the bar.
  const more: React.ReactNode[] = [];
  const chips: { key: string; filter: string; value: string; clear: Partial<ReportsUrlState> }[] =
    [];
  if (!fixedProjectId) {
    more.push(
      <ReportSelect
        key="project"
        label={projectLabel}
        className="w-full"
        value={state.projectId ?? ALL}
        options={[
          { value: ALL, label: intl.formatMessage(messages.allProjects) },
          ...projects.map((project) => ({ value: project.id, label: project.name })),
        ]}
        onChange={(value) => {
          // An automation belongs to one project, so it does not carry over to another.
          const { automation: _automation, ...aiFilters } = state.aiFilters;
          onChange({
            projectId: value === ALL ? null : value,
            jobId: null,
            jobIds: [],
            aiFilters,
          });
        }}
      />,
    );
    const project = state.projectId
      ? projects.find((candidate) => candidate.id === state.projectId)
      : undefined;
    if (project) {
      const { automation: _automation, ...aiFilters } = state.aiFilters;
      chips.push({
        key: "project",
        filter: projectLabel,
        value: project.name,
        clear: { projectId: null, jobId: null, jobIds: [], aiFilters },
      });
    }
  }
  if (filters.task === "one") {
    more.push(
      <TaskPicker
        key="task"
        className="w-full"
        organizationSlug={organizationSlug}
        projectId={state.projectId}
        value={state.jobId}
        onChange={(jobId) => onChange({ jobId })}
      />,
    );
    if (state.jobId)
      chips.push({
        key: "task",
        filter: taskLabel,
        value: chosenTask.data?.find((task) => task.id === state.jobId)?.title ?? "…",
        clear: { jobId: null },
      });
  }
  if (filters.language) {
    const label = intl.formatMessage(messages.language);
    more.push(
      <ReportSelect
        key="language"
        label={label}
        className="w-full"
        value={state.targetLocale ?? ALL}
        options={[
          { value: ALL, label: intl.formatMessage(messages.allLanguages) },
          ...languages.map((locale) => ({ value: locale, label: locale })),
        ]}
        onChange={(value) => onChange({ targetLocale: value === ALL ? null : value })}
      />,
    );
    if (state.targetLocale)
      chips.push({
        key: "language",
        filter: label,
        value: state.targetLocale,
        clear: { targetLocale: null },
      });
  }
  if (filters.step) {
    const label = intl.formatMessage(messages.step);
    more.push(
      <ReportSelect
        key="step"
        label={label}
        className="w-full"
        value={state.step}
        options={REPORT_STEPS.map((step) => ({ value: step, label: stepLabel(intl, step) }))}
        onChange={(value) => onChange({ step: value as ReportsUrlState["step"] })}
      />,
    );
    if (state.step !== DEFAULT_REPORTS_STATE.step)
      chips.push({
        key: "step",
        filter: label,
        value: stepLabel(intl, state.step),
        clear: { step: DEFAULT_REPORTS_STATE.step },
      });
  }
  if (filters.ai) {
    const aiFilters = [
      // The URL's values were checked against these lists when it was read.
      {
        dimension: "area",
        values: AI_ORIGINS,
        label: (value: string) => originLabel(intl, value as AiOrigin),
      },
      {
        dimension: "channel",
        values: AI_CHANNELS,
        label: (value: string) => channelLabel(intl, value as AiChannel),
      },
      {
        dimension: "key",
        values: AI_KEY_TYPES,
        label: (value: string) => keyTypeLabel(intl, value as AiKeyType),
      },
    ] as const;
    for (const { dimension, values, label } of aiFilters) {
      more.push(
        <AiFilterSelect
          key={dimension}
          dimension={dimension}
          values={values}
          label={label}
          state={state}
          onChange={onChange}
        />,
      );
      const value = state.aiFilters[dimension];
      if (value) {
        const { [dimension]: _dropped, ...rest } = state.aiFilters;
        chips.push({
          key: dimension,
          filter: dimensionLabel(intl, dimension),
          value: label(value),
          clear: { aiFilters: rest },
        });
      }
    }
  }

  if (filters.rateCard)
    more.push(
      <ReportSelect
        key="rateCard"
        label={intl.formatMessage(messages.rateCard)}
        className="w-full"
        value={chosenRateCard(state, settings) ?? ALL}
        disabled={settings.rateCardNames.length === 0}
        options={
          settings.rateCardNames.length
            ? settings.rateCardNames.map((name) => ({ value: name, label: name }))
            : [{ value: ALL, label: intl.formatMessage(messages.noRateCards) }]
        }
        onChange={(value) => onChange({ rateCard: value === ALL ? null : value })}
      />,
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {leading}
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          {more.length ? (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className={cn(REPORT_PILL, chips.length > 0 && "text-foreground")}
                  />
                }
              >
                <FunnelSimpleIcon aria-hidden />
                {intl.formatMessage(messages.filters)}
                {chips.length ? (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
                    {chips.length}
                  </span>
                ) : null}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 gap-3">
                {more}
              </PopoverContent>
            </Popover>
          ) : null}
          {filters.dates ? (
            <ReportsDateRange state={state} settings={settings} onChange={onChange} />
          ) : null}
          {filters.rateCard ? (
            <button type="button" className={REPORT_PILL} onClick={onOpenRates}>
              {intl.formatMessage(settings.canManage ? messages.manageRates : messages.viewRates)}
            </button>
          ) : null}
        </div>
      </div>
      {filters.task === "many" ? (
        <TasksPicker
          organizationSlug={organizationSlug}
          projectId={state.projectId}
          value={state.jobIds}
          onChange={(jobIds) => onChange({ jobIds })}
        />
      ) : null}
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-6 max-w-72 items-center gap-1 rounded-full border border-border/60 bg-muted/60 ps-2.5 pe-0.5 text-xs"
            >
              {intl.formatMessage(messages.activeFilter, {
                filter: chip.filter,
                value: chip.value,
              })}
              <button
                type="button"
                aria-label={intl.formatMessage(messages.removeFilter, { filter: chip.filter })}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => onChange(chip.clear)}
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          {chips.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(Object.assign({}, ...chips.map((chip) => chip.clear)))}
            >
              {intl.formatMessage(messages.clearFilters)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One of AI usage's details with fixed values, as a filter. */
function AiFilterSelect<T extends string>({
  dimension,
  values,
  label,
  state,
  onChange,
}: {
  dimension: "area" | "channel" | "key";
  values: readonly T[];
  label: (value: T) => string;
  state: ReportsUrlState;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  return (
    <ReportSelect
      label={dimensionLabel(intl, dimension)}
      className="w-full"
      value={state.aiFilters[dimension] ?? ALL}
      options={[
        { value: ALL, label: intl.formatMessage(aiMessages.allValues) },
        ...values.map((value) => ({ value, label: label(value) })),
      ]}
      onChange={(value) => {
        const { [dimension]: _dropped, ...rest } = state.aiFilters;
        onChange({ aiFilters: value === ALL ? rest : { ...rest, [dimension]: value } });
      }}
    />
  );
}

/** The rate card an estimate uses: the chosen one, else the workspace's first. */
export function chosenRateCard(state: ReportsUrlState, settings: ReportSettings) {
  // A card in the URL that no longer exists falls back like no choice at all.
  const names: string[] = settings.rateCardNames;
  return state.rateCard && names.includes(state.rateCard) ? state.rateCard : (names[0] ?? null);
}

export function ReportSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  hideLabel,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** In a table row, where the column heading already says what the field is. */
  hideLabel?: boolean;
  /** Shown while nothing is chosen. */
  placeholder?: string;
}) {
  const id = useId();
  return (
    <Field className={className ?? "w-full sm:w-48"}>
      <FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ??
              (value || <span className="text-muted-foreground">{placeholder}</span>)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} label={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Search text, sent once typing pauses. */
function useTaskSearch() {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(draft.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [draft]);
  return { search, setDraft };
}

const sameTask = (left: ReportTask, right: ReportTask) => left.id === right.id;

/** The task's project, state and creation day, so two tasks named alike can be told apart. */
function TaskDetails({
  task,
  settings,
}: {
  task: ReportTask;
  settings: ReportSettings | undefined;
}) {
  const intl = useIntl();
  const project = settings?.projects.find((candidate) => candidate.id === task.projectId);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{task.title}</span>
      <span className="truncate text-xs text-muted-foreground">
        {[
          project?.name,
          taskStatusLabel(intl, task.status),
          intl.formatDate(task.createdAt, { dateStyle: "medium" }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

const TASK_STATUS_LABELS: Partial<Record<string, keyof typeof messages>> = {
  queued: "taskStatusQueued",
  running: "taskStatusRunning",
  waiting_for_review: "taskStatusWaitingForReview",
  succeeded: "taskStatusSucceeded",
  cancelled: "taskStatusCancelled",
  failed: "taskStatusFailed",
};

function taskStatusLabel(intl: ReturnType<typeof useIntl>, status: string) {
  const key = TASK_STATUS_LABELS[status];
  return key ? intl.formatMessage(messages[key]) : status;
}

function TaskPicker({
  organizationSlug,
  projectId,
  value,
  onChange,
  label,
  placeholder,
  className,
  hideLabel,
}: {
  organizationSlug: string;
  projectId: string | null;
  value: string | null;
  onChange: (jobId: string | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** In the filter bar, where the placeholder already says what the field is. */
  hideLabel?: boolean;
}) {
  const intl = useIntl();
  const id = useId();
  const { search, setDraft } = useTaskSearch();
  const settings = useReportSettings(organizationSlug);
  const chosen = useReportTasks({
    organizationSlug,
    projectId: null,
    ids: value ? [value] : [],
    enabled: Boolean(value),
  });
  const selected = value ? (chosen.data?.find((task) => task.id === value) ?? null) : null;
  // The input shows the chosen task's title; that is not a search.
  const found = useReportTasks({
    organizationSlug,
    projectId,
    search: selected && search === selected.title ? "" : search,
  });
  const text = label ?? intl.formatMessage(messages.task);
  return (
    <Field className={className ?? "w-full sm:w-64"}>
      <FieldLabel htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {text}
      </FieldLabel>
      <Combobox<ReportTask>
        items={found.data ?? []}
        value={selected}
        filter={null}
        itemToStringLabel={(task) => task.title}
        isItemEqualToValue={sameTask}
        onInputValueChange={(next) => setDraft(next)}
        onValueChange={(task) => onChange(task?.id ?? null)}
      >
        <ComboboxInput
          id={id}
          aria-label={text}
          placeholder={placeholder ?? intl.formatMessage(messages.allTasks)}
          showClear={Boolean(value)}
          clearLabel={intl.formatMessage(messages.clearTask)}
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>{intl.formatMessage(messages.noTasks)}</ComboboxEmpty>
          <ComboboxList>
            {(task: ReportTask) => (
              <ComboboxItem key={task.id} value={task}>
                <TaskDetails task={task} settings={settings.data} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

function TasksPicker({
  organizationSlug,
  projectId,
  value,
  onChange,
}: {
  organizationSlug: string;
  projectId: string | null;
  value: string[];
  onChange: (jobIds: string[]) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const { search, setDraft } = useTaskSearch();
  const settings = useReportSettings(organizationSlug);
  const found = useReportTasks({ organizationSlug, projectId, search });
  const chosen = useReportTasks({
    organizationSlug,
    projectId: null,
    ids: value,
    enabled: value.length > 0,
  });
  // Tasks picked here are known at once; looking them up again would lose a quick second pick.
  const [picked, setPicked] = useState<Map<string, ReportTask>>(() => new Map());
  const known = (jobId: string) =>
    picked.get(jobId) ?? chosen.data?.find((task) => task.id === jobId);
  const selected = value.flatMap((jobId) => {
    const task = known(jobId);
    return task ? [task] : [];
  });
  return (
    <Field className="w-full sm:w-80">
      <FieldLabel htmlFor={id} className="sr-only">
        {intl.formatMessage(messages.tasks)}
      </FieldLabel>
      <Combobox<ReportTask, true>
        items={found.data ?? []}
        multiple
        value={selected}
        filter={null}
        itemToStringLabel={(task) => task.title}
        isItemEqualToValue={sameTask}
        onInputValueChange={(next) => setDraft(next)}
        onValueChange={(tasks) => {
          setPicked(
            (current) => new Map([...current, ...tasks.map((task) => [task.id, task] as const)]),
          );
          // Chosen tasks still being looked up, or whose lookup failed, stay chosen; one the
          // lookup did not return (a deleted task, or one the viewer cannot open) is dropped.
          const unknown =
            chosen.isFetching || chosen.isError ? value.filter((jobId) => !known(jobId)) : [];
          onChange([...unknown, ...tasks.map((task) => task.id)].slice(0, MAX_ESTIMATE_TASKS));
        }}
      >
        <ComboboxChips className="max-h-28 w-full overflow-y-auto">
          <ComboboxValue>
            {selected.map((task) => (
              <ComboboxChip
                key={task.id}
                title={task.title}
                removeLabel={intl.formatMessage(messages.removeTask, { task: task.title })}
              >
                <span className="max-w-40 truncate">{task.title}</span>
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput id={id} placeholder={intl.formatMessage(messages.searchTasks)} />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>{intl.formatMessage(messages.noTasks)}</ComboboxEmpty>
          <ComboboxList>
            {(task: ReportTask) => (
              <ComboboxItem key={task.id} value={task}>
                <TaskDetails task={task} settings={settings.data} />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export { TaskPicker };
