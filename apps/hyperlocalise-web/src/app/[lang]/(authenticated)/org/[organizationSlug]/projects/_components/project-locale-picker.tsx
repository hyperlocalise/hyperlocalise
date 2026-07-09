"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
import { canonicalizeLocale, COMMON_LOCALES, isValidLocaleInput } from "@/lib/i18n/locales";

function sortLocaleCodes(locales: string[]) {
  return [...locales].toSorted((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function ProjectSourceLocalePicker({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (locale: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const fieldId = useId();
  const intl = useIntl();

  const options = useMemo(() => {
    const merged = new Set<string>(COMMON_LOCALES);
    if (value) {
      merged.add(value);
    }
    return [...merged].toSorted((a, b) =>
      formatLocaleDisplayName(intl, a).localeCompare(formatLocaleDisplayName(intl, b)),
    );
  }, [intl, value]);

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={fieldId}>Source locale</FieldLabel>
      <Select
        value={value || undefined}
        onValueChange={(next) => {
          if (next) {
            onChange(next);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger id={fieldId} className="w-full border-border bg-muted text-foreground">
          <SelectValue placeholder="Select locale" />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          className="w-max min-w-[17rem] max-w-[min(22rem,calc(100vw-2rem))]"
        >
          {options.map((locale) => (
            <SelectItem key={locale} value={locale} label={formatLocaleOptionLabel(intl, locale)}>
              <span className="truncate">{formatLocaleDisplayName(intl, locale)}</span>
              <span className="text-muted-foreground">({locale})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  );
}

export function ProjectTargetLocalesPicker({
  value,
  onChange,
  sourceLocale,
  disabled,
  error,
}: {
  value: string[];
  onChange: (locales: string[]) => void;
  sourceLocale: string;
  disabled?: boolean;
  error?: string;
}) {
  const fieldId = useId();
  const customId = useId();
  const intl = useIntl();
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customLocale, setCustomLocale] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();

  useEffect(() => {
    if (showCustomInput) {
      document.getElementById(customId)?.focus();
    }
  }, [customId, showCustomInput]);

  const selected = useMemo(() => new Set(value.map((locale) => locale.toLowerCase())), [value]);
  const sourceKey = sourceLocale.trim().toLowerCase();
  const commonLocaleKeys = useMemo(
    () => new Set(COMMON_LOCALES.map((locale) => locale.toLowerCase())),
    [],
  );
  const commonLocales = useMemo(
    () => sortLocaleCodes(COMMON_LOCALES.filter((locale) => locale.toLowerCase() !== sourceKey)),
    [sourceKey],
  );
  const extraSelectedLocales = useMemo(
    () => sortLocaleCodes(value.filter((locale) => !commonLocaleKeys.has(locale.toLowerCase()))),
    [commonLocaleKeys, value],
  );

  useEffect(() => {
    if (!sourceKey) {
      return;
    }

    const nextTargets = value.filter((locale) => locale.toLowerCase() !== sourceKey);
    if (nextTargets.length !== value.length) {
      onChange(nextTargets);
    }
  }, [onChange, sourceKey, value]);

  function toggleLocale(locale: string) {
    const key = locale.toLowerCase();
    if (key === sourceKey) {
      return;
    }

    if (selected.has(key)) {
      onChange(value.filter((entry) => entry.toLowerCase() !== key));
      return;
    }

    onChange(sortLocaleCodes([...value, locale]));
  }

  function applyCustomLocale() {
    if (!isValidLocaleInput(customLocale)) {
      setCustomError("Enter a valid BCP-47 locale (e.g. fr-FR, zh-Hant-TW).");
      return;
    }

    const canonical = canonicalizeLocale(customLocale) as string;
    if (canonical.toLowerCase() === sourceKey) {
      setCustomError("Target locale cannot match the source locale.");
      return;
    }

    toggleLocale(canonical);
    setCustomLocale("");
    setCustomError(undefined);
    setShowCustomInput(false);
  }

  return (
    <Field className="gap-1.5">
      <FieldLabel id={fieldId}>Target locales</FieldLabel>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={fieldId}>
        {commonLocales.map((locale) => {
          const isSelected = selected.has(locale.toLowerCase());

          return (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={disabled}
              onClick={() => toggleLocale(locale)}
              className="h-7 px-2.5 text-xs"
              title={formatLocaleOptionLabel(intl, locale)}
            >
              {locale}
            </Button>
          );
        })}
        {extraSelectedLocales
          .filter((locale) => locale.toLowerCase() !== sourceKey)
          .map((locale) => (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant="default"
              disabled={disabled}
              onClick={() => toggleLocale(locale)}
              className="h-7 px-2.5 text-xs"
              title={formatLocaleOptionLabel(intl, locale)}
            >
              {locale}
            </Button>
          ))}
      </div>
      {showCustomInput ? (
        <div className="flex gap-2">
          <Input
            id={customId}
            value={customLocale}
            onChange={(event) => {
              setCustomLocale(event.target.value);
              setCustomError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyCustomLocale();
              }
              if (event.key === "Escape") {
                setShowCustomInput(false);
                setCustomLocale("");
                setCustomError(undefined);
              }
            }}
            disabled={disabled}
            placeholder="Other target locale"
            className="min-w-0 flex-1 border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            onClick={applyCustomLocale}
          >
            Add
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 shrink-0 px-0"
          disabled={disabled}
          aria-label="Add other target locale"
          onClick={() => setShowCustomInput(true)}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
        </Button>
      )}
      <FieldError errors={error || customError ? [{ message: error ?? customError }] : undefined} />
    </Field>
  );
}
