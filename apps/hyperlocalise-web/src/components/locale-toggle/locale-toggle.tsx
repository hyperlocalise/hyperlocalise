"use client";

import { LanguageCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
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
  getAppLocaleFromPathname,
  getNativeLocaleDisplayName,
  rewriteAppLocalePath,
} from "@/lib/app-i18n/rewrite-app-locale-path";

import { localeToggleMessages } from "./locale-toggle.messages";

export function LocaleToggle() {
  const intl = useIntl();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const activeLocale = getAppLocaleFromPathname(pathname);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm" className="rounded-full">
                  <HugeiconsIcon icon={LanguageCircleIcon} strokeWidth={2} className="size-4" />
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

            const search = typeof window !== "undefined" ? window.location.search : "";
            const hash = typeof window !== "undefined" ? window.location.hash : "";
            router.push(rewriteAppLocalePath(`${pathname}${search}${hash}`, nextLocale));
          }}
        >
          {SUPPORTED_APP_LOCALES.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              <span className="truncate">{getNativeLocaleDisplayName(locale)}</span>
              <span className="text-muted-foreground">({locale})</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LocaleToggle;
