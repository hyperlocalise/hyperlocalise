"use client";

import { useId, useMemo, useState } from "react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
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
    <Field className="gap-1.5">
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
        <SelectTrigger
          id={fieldId}
          className="border-foreground/10 bg-foreground/6 text-foreground"
        >
          <SelectValue placeholder="Select source locale" />
        </SelectTrigger>
        <SelectContent>
          {options.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {getLocaleLabel(locale)} ({locale})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input
          id={customId}
          value={customLocale}
          onChange={(event) => {
            setCustomLocale(event.target.value);
            setCustomError(undefined);
          }}
          disabled={disabled}
          placeholder="Custom locale, e.g. en-GB"
          className="border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
        />
        <Button type="button" variant="outline" disabled={disabled} onClick={applyCustomLocale}>
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

  function removeLocale(locale: string) {
    onChange(value.filter((entry) => entry !== locale));
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
    <Field className="gap-2">
      <FieldLabel id={fieldId}>Target locales</FieldLabel>
      <p className="text-xs text-foreground/48">
        Pick from common markets or add a custom BCP-47 locale tag.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={fieldId}>
        {COMMON_LOCALES.map((locale) => {
          const isSource = locale.toLowerCase() === sourceKey;
          const isSelected = selected.has(locale.toLowerCase());

          return (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={disabled || isSource}
              onClick={() => toggleLocale(locale)}
              className="h-8"
            >
              {locale}
            </Button>
          );
        })}
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((locale) => (
            <Badge key={locale} variant="secondary" className="gap-1 pr-1">
              <span>
                {locale} · {getLocaleLabel(locale)}
              </span>
              <button
                type="button"
                className="rounded-sm p-0.5 text-foreground/56 hover:text-foreground"
                disabled={disabled}
                onClick={() => removeLocale(locale)}
                aria-label={`Remove ${locale}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={customId}
          value={customLocale}
          onChange={(event) => {
            setCustomLocale(event.target.value);
            setCustomError(undefined);
          }}
          disabled={disabled}
          placeholder="Custom target locale"
          className="border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
        />
        <Button type="button" variant="outline" disabled={disabled} onClick={applyCustomLocale}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          Add
        </Button>
      </div>
      <FieldError errors={error || customError ? [{ message: error ?? customError }] : undefined} />
    </Field>
  );
}
