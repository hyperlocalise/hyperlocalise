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
import { useId } from "react";
import { FunnelSimpleIcon, XIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/primitives/cn";
import { translationQaScanCheckTypes } from "@/lib/qa/types";
import { qaCheckLabel } from "./qa-findings-table";
import { QA_FILTER_ALL } from "./qa-filters-store";
import { qaMessages as m } from "./qa.messages";

export type QaFilterOption = { value: string; label: string };

export function QaFilter({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: QaFilterOption[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field className="w-full sm:w-48">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger id={id} aria-label={label} className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
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

/** A small set of mutually exclusive options shown as pressed buttons. */
export function QaSegmentedControl({
  label,
  value,
  onChange,
  options,
  disabled,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: QaFilterOption[];
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className={hideLabel ? "sr-only" : "text-sm leading-snug font-medium"}>
        {label}
      </span>
      <ButtonGroup aria-labelledby={labelId}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={selected ? "secondary" : "outline"}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => {
                if (!selected) onChange(option.value);
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </ButtonGroup>
    </div>
  );
}

export type QaFindingFilterKey = "projectId" | "locale" | "checkType" | "severity" | "status";

const QA_PILL =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const QA_PILL_OFF = "border-border text-muted-foreground hover:text-foreground";
const QA_PILL_ON = "border-transparent bg-muted text-foreground";

/**
 * Linear-style findings header: review status as pills on the left, every other filter in one
 * menu on the right, and the filters in use as removable chips below.
 */
export function QaFindingFilterBar({
  values,
  locales,
  projects,
  total,
  isFiltered,
  onChange,
  onClear,
}: {
  values: Record<Exclude<QaFindingFilterKey, "projectId">, string> & { projectId?: string };
  locales: string[];
  /** Pass to show the project filter (workspace scope). */
  projects?: QaFilterOption[];
  /** Findings that match the filters, once known. */
  total?: number;
  isFiltered: boolean;
  onChange: (key: QaFindingFilterKey, value: string) => void;
  onClear: () => void;
}) {
  const intl = useIntl();
  const all = { value: QA_FILTER_ALL, label: intl.formatMessage(m.all) };
  const fields: {
    key: Exclude<QaFindingFilterKey, "status">;
    label: string;
    value: string;
    options: QaFilterOption[];
  }[] = [
    {
      key: "severity",
      label: intl.formatMessage(m.severity),
      value: values.severity,
      options: [
        all,
        { value: "error", label: intl.formatMessage(m.errorsFilter) },
        { value: "warning", label: intl.formatMessage(m.warningsFilter) },
      ],
    },
    ...(projects
      ? [
          {
            key: "projectId" as const,
            label: intl.formatMessage(m.projects),
            value: values.projectId ?? QA_FILTER_ALL,
            options: [all, ...projects],
          },
        ]
      : []),
    {
      key: "locale",
      label: intl.formatMessage(m.language),
      value: values.locale,
      options: [all, ...locales.map((value) => ({ value, label: value }))],
    },
    {
      key: "checkType",
      label: intl.formatMessage(m.check),
      value: values.checkType,
      options: [
        all,
        ...translationQaScanCheckTypes.map((value) => ({
          value,
          label: qaCheckLabel(value, intl),
        })),
      ],
    },
  ];
  const chips = fields
    .filter((field) => field.value !== QA_FILTER_ALL)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: field.options.find((option) => option.value === field.value)?.label ?? field.value,
    }));
  const filterLabel = intl.formatMessage(m.filterFindings);
  const statusOptions = [
    ...(["open", "ignored", "resolved"] as const).map((value) => ({
      value,
      label: intl.formatMessage(m[value]),
    })),
    all,
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="radiogroup"
          aria-label={intl.formatMessage(m.status)}
          className="flex flex-wrap items-center gap-1.5"
        >
          {statusOptions.map((option) => {
            const on = option.value === values.status;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (!on) onChange("status", option.value);
                }}
                className={cn(QA_PILL, on ? QA_PILL_ON : QA_PILL_OFF)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="ms-auto flex items-center gap-3">
          {total !== undefined ? (
            <p className="text-xs text-muted-foreground tabular-nums" role="status">
              {intl.formatMessage(m.resultCount, { count: total })}
            </p>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={filterLabel}
                  title={filterLabel}
                  className={cn(
                    "relative inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground",
                    chips.length > 0 && "text-foreground",
                  )}
                />
              }
            >
              <FunnelSimpleIcon aria-hidden className="size-3.5" />
              {chips.length ? (
                <span
                  aria-hidden
                  className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {fields.map((field) => (
                <DropdownMenuSub key={field.key}>
                  <DropdownMenuSubTrigger>{field.label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80">
                    <DropdownMenuRadioGroup
                      value={field.value}
                      onValueChange={(value) => onChange(field.key, String(value))}
                    >
                      {field.options.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {chips.length || isFiltered ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-6 max-w-72 items-center gap-1.5 rounded-md bg-muted ps-2 pe-0.5 text-xs text-muted-foreground"
            >
              {chip.label}
              <span className="truncate text-foreground">{chip.value}</span>
              <button
                type="button"
                aria-label={intl.formatMessage(m.removeFilter, chip)}
                onClick={() => onChange(chip.key, QA_FILTER_ALL)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-background/60 hover:text-foreground"
              >
                <XIcon aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="ms-auto text-xs text-muted-foreground hover:text-foreground"
          >
            {intl.formatMessage(m.clearAll)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
