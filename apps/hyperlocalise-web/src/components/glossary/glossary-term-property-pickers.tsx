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
import { useMemo, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl, type MessageDescriptor } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  glossaryGenderValues,
  glossaryPartOfSpeechValues,
  glossaryTermStatusValues,
  glossaryTermTypeValues,
  type GlossaryPartOfSpeech,
  type GlossaryTermStatus,
  type GlossaryTermType,
} from "@/lib/glossary/glossary";
import { cn } from "@/lib/primitives/cn";

import { glossaryTermPropertyPickersMessages as messages } from "./glossary-term-property-pickers.messages";

export type GlossaryTermMetadataDraft = {
  partOfSpeech: string;
  gender: string | null;
  termType: string | null;
  status: GlossaryTermStatus;
};

export const emptyGlossaryTermMetadataDraft: GlossaryTermMetadataDraft = {
  partOfSpeech: "",
  gender: null,
  termType: null,
  status: "draft",
};

const genderOptions = glossaryGenderValues;
const termTypeOptions = glossaryTermTypeValues;
const partOfSpeechOptions = glossaryPartOfSpeechValues;
const statusOptions = glossaryTermStatusValues;

export function readableEnumLabel(value: string) {
  const label = value.replace(/_/g, " ");
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

const partOfSpeechMarks: Record<string, string> = {
  noun: "N",
  "proper noun": "PN",
  verb: "V",
  auxiliary: "Aux",
  adjective: "Adj",
  adverb: "Adv",
  pronoun: "Pro",
  adposition: "Adp",
  preposition: "Prep",
  conjunction: "Conj",
  "coordinating conjunction": "CConj",
  "subordinating conjunction": "SConj",
  determiner: "Det",
  interjection: "Int",
  numeral: "Num",
  particle: "Part",
  article: "Art",
  abbreviation: "Abbr",
  phrase: "Phr",
  other: "Other",
};

export function partOfSpeechMark(value: string) {
  return partOfSpeechMarks[value.trim().toLowerCase()] ?? "Other";
}

const genderMarks: Record<string, string> = {
  masculine: "M",
  feminine: "F",
  neuter: "N",
  other: "O",
};

export function genderMark(value: string) {
  return genderMarks[value.trim().toLowerCase()] ?? "O";
}

const termTypeMarks: Record<GlossaryTermType, string> = {
  "full form": "FF",
  acronym: "AC",
  abbreviation: "AB",
  "short form": "SF",
  phrase: "PH",
  variant: "VAR",
};

const termTypeDescriptionMessages: Record<GlossaryTermType, MessageDescriptor> = {
  "full form": messages.termTypeFullFormDescription,
  acronym: messages.termTypeAcronymDescription,
  abbreviation: messages.termTypeAbbreviationDescription,
  "short form": messages.termTypeShortFormDescription,
  phrase: messages.termTypePhraseDescription,
  variant: messages.termTypeVariantDescription,
};

export function termTypeMark(value: string) {
  return termTypeMarks[value.trim().toLowerCase() as GlossaryTermType] ?? "VAR";
}

export const termPropertyTriggerClassName =
  "h-8 w-[100px] shrink-0 border-transparent bg-transparent px-2.5 text-sm font-normal shadow-none hover:bg-muted/60 focus-visible:bg-muted/60";

export function statusPickerTriggerClass() {
  return "h-8 w-[140px] shrink-0 justify-end rounded-md border-transparent bg-transparent px-1.5 shadow-none hover:bg-muted/60 focus-visible:border-ring";
}

export function statusPickerItemClass(_status: GlossaryTermStatus) {
  return "rounded-lg px-2 py-1.5 hover:bg-muted! focus:bg-muted! focus:text-foreground! data-highlighted:bg-muted! data-highlighted:text-foreground!";
}

export const statusPickerContentClassName = "min-w-44 p-1.5";

function statusClass(status: GlossaryTermStatus) {
  if (status === "preferred") {
    return "!border-emerald-500/30 !bg-emerald-500/10 !text-emerald-700 dark:!text-emerald-300";
  }
  if (status === "admitted") {
    return "!border-sky-500/30 !bg-sky-500/10 !text-sky-700 dark:!text-sky-300";
  }
  if (status === "draft") {
    return "!border-amber-500/30 !bg-amber-500/10 !text-amber-700 dark:!text-amber-300";
  }
  if (status === "not_recommended") {
    return "!border-rose-500/30 !bg-rose-500/10 !text-rose-700 dark:!text-rose-300";
  }
  return "!border-slate-500/30 !bg-slate-500/10 !text-slate-700 dark:!text-slate-300";
}

export function statusBadgeClass(status: GlossaryTermStatus) {
  return cn(statusClass(status), "px-1.5 py-0 text-[11px] leading-5");
}

function TermMark({ mark }: { mark: string }) {
  return (
    <Badge
      variant="outline"
      className="h-5 min-w-7 justify-center rounded-md border-border/70 bg-muted/35 px-1 py-0 text-[11px] font-medium leading-4 text-foreground"
      aria-hidden="true"
    >
      {mark}
    </Badge>
  );
}

export function PartOfSpeechMark({ value }: { value: string }) {
  return <TermMark mark={partOfSpeechMark(value)} />;
}

export function GenderMark({ value }: { value: string }) {
  return <TermMark mark={genderMark(value)} />;
}

export function PartOfSpeechDisplay({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="truncate text-muted-foreground">—</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex w-10 shrink-0 items-center">
        <PartOfSpeechMark value={value} />
      </span>
      <span className="truncate">{readableEnumLabel(value)}</span>
    </span>
  );
}

export function GenderDisplay({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="truncate text-muted-foreground">—</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex w-10 shrink-0 items-center">
        <GenderMark value={value} />
      </span>
      <span className="truncate">{readableEnumLabel(value)}</span>
    </span>
  );
}

export function TermTypeDisplay({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="truncate text-muted-foreground">—</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex w-10 shrink-0 items-center">
        <TermMark mark={termTypeMark(value)} />
      </span>
      <span className="truncate">{readableEnumLabel(value)}</span>
    </span>
  );
}

export function TermStatusIcon({
  status,
  className,
}: {
  status: GlossaryTermStatus;
  className?: string;
}) {
  const iconClassName = cn("size-4 shrink-0", className);

  if (status === "preferred") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="8" cy="8" r="7" className="fill-emerald-500" />
        <path
          d="m5 8.2 2 2 4-4"
          stroke="white"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === "admitted") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-sky-500" strokeWidth="1.75" />
        <circle cx="8" cy="8" r="2.25" className="fill-sky-500" />
      </svg>
    );
  }

  if (status === "draft") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-amber-500" strokeWidth="1.75" />
        <path d="M8 2a6 6 0 0 1 0 12Z" className="fill-amber-500" />
      </svg>
    );
  }

  if (status === "not_recommended") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className={iconClassName} aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="stroke-rose-500" strokeWidth="1.75" />
        <path d="M5.5 8h5" className="stroke-rose-500" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClassName} aria-hidden="true">
      <circle cx="8" cy="8" r="7" className="fill-slate-500" />
      <path d="m5.5 5.5 5 5m0-5-5 5" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function StatusLabel({
  status,
  className,
}: {
  status: GlossaryTermStatus;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <TermStatusIcon status={status} />
      <span>{readableEnumLabel(status)}</span>
    </span>
  );
}

function partOfSpeechOptionsFor(value: string) {
  return value && !partOfSpeechOptions.includes(value as GlossaryPartOfSpeech)
    ? [value, ...partOfSpeechOptions]
    : partOfSpeechOptions;
}

export function PartOfSpeechPicker({
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = useMemo(() => partOfSpeechOptionsFor(value), [value]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
    }
  };

  const selectValue = (nextValue: string) => {
    onValueChange(nextValue);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={`${intl.formatMessage(messages.partOfSpeechLabel)}: ${
              value ? readableEnumLabel(value) : "—"
            }`}
            className={cn(
              termPropertyTriggerClassName,
              "w-[80px] max-w-[80px] shrink-0 justify-start gap-2 text-left",
              className,
            )}
          />
        }
      >
        {value ? (
          <PartOfSpeechMark value={value} />
        ) : (
          <span className="truncate text-muted-foreground">—</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[280px] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandInput
            placeholder={intl.formatMessage(messages.partOfSpeechSearchPlaceholder)}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64" label={intl.formatMessage(messages.partOfSpeechLabel)}>
            <CommandEmpty>{intl.formatMessage(messages.partOfSpeechNoMatches)}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={`${option} ${readableEnumLabel(option)} ${partOfSpeechMark(option)}`}
                  data-checked={value === option || undefined}
                  aria-label={readableEnumLabel(option)}
                  onSelect={() => selectValue(option)}
                >
                  <PartOfSpeechDisplay value={option} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function GenderPicker({
  value,
  onValueChange,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={`${intl.formatMessage(messages.genderLabel)}: ${
              value ? readableEnumLabel(value) : "—"
            }`}
            className={cn(termPropertyTriggerClassName, "justify-start gap-2 text-left")}
          />
        }
      >
        {value ? (
          <GenderMark value={value} />
        ) : (
          <span className="truncate text-muted-foreground">—</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[280px] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandList className="max-h-64" label={intl.formatMessage(messages.genderLabel)}>
            <CommandEmpty>{intl.formatMessage(messages.partOfSpeechNoMatches)}</CommandEmpty>
            <CommandGroup>
              {genderOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={`${option} ${readableEnumLabel(option)} ${genderMark(option)}`}
                  data-checked={value === option || undefined}
                  aria-label={readableEnumLabel(option)}
                  onSelect={() => {
                    onValueChange(option);
                    setOpen(false);
                  }}
                >
                  <GenderDisplay value={option} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TermTypePicker({
  value,
  onValueChange,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={`${intl.formatMessage(messages.typeLabel)}: ${
              value ? readableEnumLabel(value) : "—"
            }`}
            className={cn(termPropertyTriggerClassName, "justify-start gap-2 text-left")}
          />
        }
      >
        {value ? (
          <TermMark mark={termTypeMark(value)} />
        ) : (
          <span className="truncate text-muted-foreground">—</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[280px] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandList className="max-h-64" label={intl.formatMessage(messages.typeLabel)}>
            <CommandEmpty>{intl.formatMessage(messages.partOfSpeechNoMatches)}</CommandEmpty>
            <CommandGroup>
              {termTypeOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={`${option} ${readableEnumLabel(option)} ${termTypeMark(option)}`}
                  data-checked={value === option || undefined}
                  aria-label={readableEnumLabel(option)}
                  onSelect={() => {
                    onValueChange(option);
                    setOpen(false);
                  }}
                  className="items-start py-2.5"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span className="flex w-10 shrink-0 pt-0.5">
                      <TermMark mark={termTypeMark(option)} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{readableEnumLabel(option)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {intl.formatMessage(termTypeDescriptionMessages[option])}
                      </span>
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TermStatusPicker({
  value,
  onValueChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: GlossaryTermStatus;
  onValueChange: (value: GlossaryTermStatus) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onValueChange(nextValue as GlossaryTermStatus);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        showIcon={false}
        className={cn(statusPickerTriggerClass(), className)}
        aria-label={ariaLabel}
      >
        <SelectValue>
          <StatusLabel status={value} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={statusPickerContentClassName}>
        {statusOptions.map((option) => (
          <SelectItem key={option} value={option} className={statusPickerItemClass(option)}>
            <StatusLabel status={option} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GlossaryTermMetadataFields({
  value,
  onChange,
  disabled = false,
}: {
  value: GlossaryTermMetadataDraft;
  onChange: (value: GlossaryTermMetadataDraft) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TermStatusPicker
        value={value.status}
        onValueChange={(status) => onChange({ ...value, status })}
        disabled={disabled}
        aria-label={intl.formatMessage(messages.statusLabel)}
      />
      <GenderPicker
        value={value.gender ?? ""}
        onValueChange={(gender) => onChange({ ...value, gender })}
        disabled={disabled}
      />
      <TermTypePicker
        value={value.termType ?? ""}
        onValueChange={(termType) => onChange({ ...value, termType })}
        disabled={disabled}
      />
      <PartOfSpeechPicker
        value={value.partOfSpeech}
        onValueChange={(partOfSpeech) => onChange({ ...value, partOfSpeech })}
        disabled={disabled}
      />
    </div>
  );
}

export function glossaryTermMetadataToPayload(metadata: GlossaryTermMetadataDraft) {
  return {
    status: metadata.status,
    ...(metadata.gender ? { gender: metadata.gender as (typeof genderOptions)[number] } : {}),
    ...(metadata.termType
      ? { termType: metadata.termType as (typeof termTypeOptions)[number] }
      : {}),
    ...(metadata.partOfSpeech ? { partOfSpeech: metadata.partOfSpeech } : {}),
  };
}
