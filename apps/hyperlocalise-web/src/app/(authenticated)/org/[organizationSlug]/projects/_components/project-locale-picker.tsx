"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  canonicalizeLocale,
  COMMON_LOCALES,
  getLocaleLabel,
  isValidLocaleInput,
} from "@/lib/i18n/locales";

function sortLocales(locales: string[]) {
  return [...locales].toSorted((a, b) => getLocaleLabel(a).localeCompare(getLocaleLabel(b)));
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
  const customId = useId();
  const [customLocale, setCustomLocale] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();

  const options = useMemo(() => {
    const merged = new Set<string>(COMMON_LOCALES);
    if (value) {
      merged.add(value);
    }
    return sortLocales([...merged]);
  }, [value]);

  function applyCustomLocale() {
    if (!isValidLocaleInput(customLocale)) {
      setCustomError("Enter a valid BCP-47 locale (e.g. en-US, zh-Hant-TW).");
      return;
    }

    onChange(canonicalizeLocale(customLocale) as string);
    setCustomLocale("");
    setCustomError(undefined);
  }

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={fieldId}>Source locale</FieldLabel>
      <div className="flex gap-2">
        <Select
          value={value || undefined}
          onValueChange={(next) => {
            if (next) {
              onChange(next);
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger
            id={fieldId}
            className="w-[7.5rem] shrink-0 border-foreground/10 bg-foreground/6 text-foreground"
          >
            <SelectValue placeholder="Locale" />
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            className="w-max min-w-[17rem] max-w-[min(22rem,calc(100vw-2rem))]"
          >
            {options.map((locale) => (
              <SelectItem key={locale} value={locale}>
                <span className="truncate">{getLocaleLabel(locale)}</span>
                <span className="text-muted-foreground">({locale})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          }}
          disabled={disabled}
          placeholder="Other, e.g. en-GB"
          className="min-w-0 flex-1 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={applyCustomLocale}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          Use
        </Button>
      </div>
      <FieldError errors={error || customError ? [{ message: error ?? customError }] : undefined} />
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
  const [customLocale, setCustomLocale] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();

  const selected = useMemo(() => new Set(value.map((locale) => locale.toLowerCase())), [value]);
  const sourceKey = sourceLocale.trim().toLowerCase();
  const commonLocaleKeys = useMemo(
    () => new Set(COMMON_LOCALES.map((locale) => locale.toLowerCase())),
    [],
  );
  const extraSelectedLocales = useMemo(
    () => sortLocales(value.filter((locale) => !commonLocaleKeys.has(locale.toLowerCase()))),
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

    onChange(sortLocales([...value, locale]));
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
  }

  return (
    <Field className="gap-1.5">
      <FieldLabel id={fieldId}>Target locales</FieldLabel>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={fieldId}>
        {COMMON_LOCALES.filter((locale) => locale.toLowerCase() !== sourceKey).map((locale) => {
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
            >
              {locale}
            </Button>
          ))}
      </div>
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
          }}
          disabled={disabled}
          placeholder="Other target locale"
          className="min-w-0 flex-1 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={applyCustomLocale}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          Add
        </Button>
      </div>
      <FieldError errors={error || customError ? [{ message: error ?? customError }] : undefined} />
    </Field>
  );
}
