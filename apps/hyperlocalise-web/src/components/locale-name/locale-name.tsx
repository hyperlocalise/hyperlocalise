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
import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import { getLocaleFlagEmoji } from "@/lib/i18n/locales";
import { cn } from "@/lib/primitives/cn";

export function LocaleName({ locale, className }: { locale: string; className?: string }) {
  const intl = useIntl();
  const flag = getLocaleFlagEmoji(locale);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {flag ? <span aria-hidden="true">{flag}</span> : null}
      <span className="truncate">{formatLocaleDisplayName(intl, locale)}</span>
    </span>
  );
}

export function LocaleNameList({
  locales,
  empty,
  className,
}: {
  locales: readonly string[];
  empty: ReactNode;
  className?: string;
}) {
  if (locales.length === 0) {
    return <span>{empty}</span>;
  }

  return (
    <span
      className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}
    >
      {locales.map((locale) => (
        <LocaleName key={locale} locale={locale} />
      ))}
    </span>
  );
}
