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
import { useRef } from "react";
import { FormattedMessage } from "react-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { useOptionalUserPreferences } from "@/components/user-preferences/user-preferences-provider";

import { localeDialogMessages } from "./locale-dialog.messages";
import { LocalePicker } from "./locale-picker";
import { navigateToAppLocale } from "./navigate-to-app-locale";

type LocaleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LocaleDialog({ open, onOpenChange }: LocaleDialogProps) {
  const activeLocale = useAppLocale();
  const preferences = useOptionalUserPreferences();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectLocale = (locale: AppLocale) => {
    if (locale === activeLocale) {
      onOpenChange(false);
      return;
    }

    if (preferences) {
      void preferences.update({ locale });
      return;
    }

    navigateToAppLocale(locale);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={searchInputRef}
        className="max-h-[min(40rem,calc(100svh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)] gap-5 sm:max-w-3xl"
      >
        <DialogHeader className="pe-10">
          <DialogTitle>
            <FormattedMessage {...localeDialogMessages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...localeDialogMessages.description} />
          </DialogDescription>
        </DialogHeader>
        <LocalePicker
          activeLocale={activeLocale}
          searchInputRef={searchInputRef}
          onSelect={selectLocale}
        />
      </DialogContent>
    </Dialog>
  );
}
