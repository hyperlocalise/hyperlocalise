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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORT_PRESET_DAYS } from "@/lib/reporting/report-period";
import { REPORT_STEPS } from "@/lib/reporting/report-units";

import { stepLabel } from "./report-format";
import { reportsPageMessages as messages } from "./reports-page.messages";
import {
  reportDates,
  useReportTasks,
  type ReportSettings,
  type ReportTask,
} from "./reports-queries";
import {
  MAX_ESTIMATE_TASKS,
  type ReportsRange,
  type ReportsTab,
  type ReportsUrlState,
} from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";

/** Which filters each tab uses; the bar shows only those. */
const TAB_FILTERS: Record<
  ReportsTab,
  { dates?: true; task?: "one" | "many"; language?: true; step?: true; rateCard?: true }
> = {
  activity: { dates: true, task: "one", language: true, step: true },
  words: { dates: true, task: "one", language: true, step: true },
  time: { dates: true, task: "one", language: true },
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
}: {
  organizationSlug: string;
  tab: ReportsTab;
  state: ReportsUrlState;
  settings: ReportSettings;
  /** On a project's own Reports page the project is fixed and its filter hidden. */
  fixedProjectId?: string;
  onChange: (change: Partial<ReportsUrlState>) => void;
  onOpenRates: () => void;
}) {
  const intl = useIntl();
  const filters = TAB_FILTERS[tab];
  const projects = settings.projects;
  const languages = useMemo(() => {
    const chosen = projects.filter((project) => !state.projectId || project.id === state.projectId);
    return [...new Set(chosen.flatMap((project) => project.targetLocales ?? []))].sort();
  }, [projects, state.projectId]);
  const dates = reportDates(state, settings.today);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filters.dates ? (
        <>
          <Field className="w-auto">
            <FieldLabel>{intl.formatMessage(messages.dates)}</FieldLabel>
            <SegmentedSwitch<ReportsRange>
              label={intl.formatMessage(messages.dates)}
              value={state.range}
              options={[
                ...REPORT_PRESET_DAYS.map((days) => ({
                  value: String(days) as ReportsRange,
                  label: intl.formatMessage(messages.lastDays, { days }),
                })),
                { value: "custom", label: intl.formatMessage(messages.customRange) },
              ]}
              onChange={(range) => onChange(range === "custom" ? { range, ...dates } : { range })}
            />
          </Field>
          {state.range === "custom" ? (
            <>
              <DateField
                label={intl.formatMessage(messages.from)}
                value={dates.from}
                min={settings.startedDay ?? undefined}
                max={settings.today}
                onChange={(from) => onChange({ from, to: dates.to })}
              />
              <DateField
                label={intl.formatMessage(messages.to)}
                value={dates.to}
                min={settings.startedDay ?? undefined}
                max={settings.today}
                onChange={(to) => onChange({ from: dates.from, to })}
              />
            </>
          ) : (
            <p className="pb-2 text-[13px] text-muted-foreground tabular-nums">
              {intl.formatMessage(messages.rangeText, {
                from: formatDay(intl, dates.from),
                to: formatDay(intl, dates.to),
              })}
            </p>
          )}
        </>
      ) : null}
      {fixedProjectId ? null : (
        <ReportSelect
          label={intl.formatMessage(messages.project)}
          value={state.projectId ?? ALL}
          options={[
            { value: ALL, label: intl.formatMessage(messages.allProjects) },
            ...projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
          onChange={(value) =>
            onChange({ projectId: value === ALL ? null : value, jobId: null, jobIds: [] })
          }
        />
      )}
      {filters.task === "one" ? (
        <TaskPicker
          organizationSlug={organizationSlug}
          projectId={state.projectId}
          value={state.jobId}
          onChange={(jobId) => onChange({ jobId })}
        />
      ) : null}
      {filters.task === "many" ? (
        <TasksPicker
          organizationSlug={organizationSlug}
          projectId={state.projectId}
          value={state.jobIds}
          onChange={(jobIds) => onChange({ jobIds })}
        />
      ) : null}
      {filters.language ? (
        <ReportSelect
          label={intl.formatMessage(messages.language)}
          value={state.targetLocale ?? ALL}
          options={[
            { value: ALL, label: intl.formatMessage(messages.allLanguages) },
            ...languages.map((locale) => ({ value: locale, label: locale })),
          ]}
          onChange={(value) => onChange({ targetLocale: value === ALL ? null : value })}
        />
      ) : null}
      {filters.step ? (
        <ReportSelect
          label={intl.formatMessage(messages.step)}
          value={state.step}
          options={REPORT_STEPS.map((step) => ({ value: step, label: stepLabel(intl, step) }))}
          onChange={(value) => onChange({ step: value as ReportsUrlState["step"] })}
        />
      ) : null}
      {filters.rateCard ? (
        <>
          <ReportSelect
            label={intl.formatMessage(messages.rateCard)}
            value={chosenRateCard(state, settings) ?? ALL}
            disabled={settings.rateCardNames.length === 0}
            options={
              settings.rateCardNames.length
                ? settings.rateCardNames.map((name) => ({ value: name, label: name }))
                : [{ value: ALL, label: intl.formatMessage(messages.noRateCards) }]
            }
            onChange={(value) => onChange({ rateCard: value === ALL ? null : value })}
          />
          <Button variant="outline" onClick={onOpenRates}>
            {intl.formatMessage(settings.canManage ? messages.manageRates : messages.viewRates)}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** The rate card an estimate uses: the chosen one, else the workspace's first. */
export function chosenRateCard(state: ReportsUrlState, settings: ReportSettings) {
  // A card in the URL that no longer exists falls back like no choice at all.
  const names: string[] = settings.rateCardNames;
  return state.rateCard && names.includes(state.rateCard) ? state.rateCard : (names[0] ?? null);
}

function formatDay(intl: ReturnType<typeof useIntl>, day: string) {
  return intl.formatDate(`${day}T00:00:00Z`, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  // Typing a date passes through dates out of range (a year starts 0002), so the field keeps
  // what is typed and only a whole date in range reaches the report.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const inRange = (day: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day) && (!min || day >= min) && day <= max;
  return (
    <Field className="w-auto">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        value={draft}
        min={min}
        max={max}
        className="w-40"
        onChange={(event) => {
          setDraft(event.target.value);
          if (inRange(event.target.value)) onChange(event.target.value);
        }}
        onBlur={() => setDraft(value)}
      />
    </Field>
  );
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

function TaskPicker({
  organizationSlug,
  projectId,
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  organizationSlug: string;
  projectId: string | null;
  value: string | null;
  onChange: (jobId: string | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const intl = useIntl();
  const id = useId();
  const { search, setDraft } = useTaskSearch();
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
      <FieldLabel htmlFor={id}>{text}</FieldLabel>
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
                <span className="truncate">{task.title}</span>
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
      <FieldLabel htmlFor={id}>{intl.formatMessage(messages.tasks)}</FieldLabel>
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
                <span className="truncate">{task.title}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export { TaskPicker };
