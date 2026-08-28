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
import { useId, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { canonicalizeLocale } from "@/lib/i18n/locales";

import { IssueLocalePicker } from "../../../_components/issue-detail/issue-locale-picker";
import { tmEntryLocaleFieldMessages as messages } from "./tm-entry-locale-field.messages";

export function TmEntryLocaleField({
  label,
  value,
  locales,
  onValueChange,
}: {
  label: string;
  value: string;
  locales: string[];
  onValueChange: (locale: string) => void;
}) {
  const intl = useIntl();
  const customId = useId();
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customLocale, setCustomLocale] = useState("");
  const [customError, setCustomError] = useState<string | undefined>();

  const applyCustomLocale = () => {
    const canonical = canonicalizeLocale(customLocale);
    if (!canonical) {
      setCustomError(intl.formatMessage(messages.invalidCustomLocale));
      return;
    }

    onValueChange(canonical);
    setCustomLocale("");
    setCustomError(undefined);
    setShowCustomInput(false);
  };

  return (
    <Field className="gap-1.5">
      <FieldLabel>
        {label}
      </FieldLabel>
      <IssueLocalePicker
        value={value}
        locales={locales}
        onValueChange={(locale) => {
          if (locale) {
            onValueChange(locale);
          }
        }}
        aria-label={label}
      />
      {showCustomInput ? (
        <div className="grid gap-2">
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
              placeholder={intl.formatMessage(messages.customLocalePlaceholder)}
              aria-label={intl.formatMessage(messages.customLocalePlaceholder)}
            />
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={applyCustomLocale}>
              <FormattedMessage {...messages.applyCustomLocale} />
            </Button>
          </div>
          <FieldError errors={customError ? [{ message: customError }] : undefined} />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 justify-start px-0 text-xs text-muted-foreground"
          onClick={() => setShowCustomInput(true)}
        >
          <FormattedMessage {...messages.useCustomLocale} />
        </Button>
      )}
    </Field>
  );
}
