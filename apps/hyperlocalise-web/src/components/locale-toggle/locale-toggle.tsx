"use client";

import { usePathname } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SUPPORTED_APP_LOCALES, type AppLocale } from "@/lib/app-i18n/locales";
import {
  getAppLocaleFlagEmoji,
  getAppLocaleFromPathname,
  getNativeLocaleDisplayName,
  rewriteAppLocalePath,
} from "@/lib/app-i18n/rewrite-app-locale-path";

import { localeToggleMessages } from "./locale-toggle.messages";

export function LocaleToggle() {
  const intl = useIntl();
  const pathname = usePathname() ?? "/";
  const activeLocale = getAppLocaleFromPathname(pathname);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full text-base leading-none"
                >
                  <span aria-hidden="true">{getAppLocaleFlagEmoji(activeLocale)}</span>
                  <span className="sr-only">
                    <FormattedMessage {...localeToggleMessages.changeLanguage} />
                  </span>
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" align="center">
          <FormattedMessage {...localeToggleMessages.changeLanguage} />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          aria-label={intl.formatMessage(localeToggleMessages.languageAria)}
          value={activeLocale}
          onValueChange={(value) => {
            const nextLocale = value as AppLocale;
            if (nextLocale === activeLocale) {
              return;
            }

            const search = window.location.search;
            const hash = window.location.hash;
            window.location.assign(rewriteAppLocalePath(`${pathname}${search}${hash}`, nextLocale));
          }}
        >
          {SUPPORTED_APP_LOCALES.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{getAppLocaleFlagEmoji(locale)}</span>
                <span>{getNativeLocaleDisplayName(locale)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LocaleToggle;
