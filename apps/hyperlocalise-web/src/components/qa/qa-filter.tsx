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
import { XIcon } from "@phosphor-icons/react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
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

/**
 * Status and severity as always-visible toggles, the rest as dropdowns, and a
 * row of removable chips with the result count so the current scope is clear.
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
  const projectLabel = intl.formatMessage(m.projects);
  const languageLabel = intl.formatMessage(m.language);
  const checkLabel = intl.formatMessage(m.check);
  const chips = [
    projects && values.projectId && values.projectId !== QA_FILTER_ALL
      ? {
          key: "projectId" as const,
          label: projectLabel,
          value:
            projects.find((option) => option.value === values.projectId)?.label ?? values.projectId,
        }
      : null,
    values.locale !== QA_FILTER_ALL
      ? { key: "locale" as const, label: languageLabel, value: values.locale }
      : null,
    values.checkType !== QA_FILTER_ALL
      ? {
          key: "checkType" as const,
          label: checkLabel,
          value: qaCheckLabel(values.checkType, intl),
        }
      : null,
  ].filter((chip) => chip !== null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <QaSegmentedControl
          label={intl.formatMessage(m.status)}
          value={values.status}
          onChange={(value) => onChange("status", value)}
          options={[
            ...(["open", "ignored", "resolved"] as const).map((value) => ({
              value,
              label: intl.formatMessage(m[value]),
            })),
            all,
          ]}
        />
        <QaSegmentedControl
          label={intl.formatMessage(m.severity)}
          value={values.severity}
          onChange={(value) => onChange("severity", value)}
          options={[
            all,
            { value: "error", label: intl.formatMessage(m.errorsFilter) },
            { value: "warning", label: intl.formatMessage(m.warningsFilter) },
          ]}
        />
        {projects ? (
          <QaFilter
            label={projectLabel}
            value={values.projectId ?? QA_FILTER_ALL}
            onChange={(value) => onChange("projectId", value)}
            options={[all, ...projects]}
          />
        ) : null}
        <QaFilter
          label={languageLabel}
          value={values.locale}
          onChange={(value) => onChange("locale", value)}
          options={[all, ...locales.map((value) => ({ value, label: value }))]}
        />
        <QaFilter
          label={checkLabel}
          value={values.checkType}
          onChange={(value) => onChange("checkType", value)}
          options={[
            all,
            ...translationQaScanCheckTypes.map((value) => ({
              value,
              label: qaCheckLabel(value, intl),
            })),
          ]}
        />
      </div>
      {total !== undefined || isFiltered ? (
        <div className="flex flex-wrap items-center gap-2">
          {total !== undefined ? (
            <p className="text-sm font-medium tabular-nums" role="status">
              {intl.formatMessage(m.resultCount, { count: total })}
            </p>
          ) : null}
          {chips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              size="xs"
              variant="secondary"
              aria-label={intl.formatMessage(m.removeFilter, chip)}
              onClick={() => onChange(chip.key, QA_FILTER_ALL)}
            >
              {intl.formatMessage(m.filterChip, chip)}
              <XIcon data-icon="inline-end" />
            </Button>
          ))}
          {isFiltered ? (
            <Button type="button" size="xs" variant="ghost" onClick={onClear}>
              {intl.formatMessage(m.clearAll)}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
