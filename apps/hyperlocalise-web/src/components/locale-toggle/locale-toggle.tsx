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
import { useState } from "react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { getAppLocaleFlagEmoji } from "@/lib/app-i18n/rewrite-app-locale-path";

import { LocaleDialog } from "./locale-dialog";
import { localeToggleMessages } from "./locale-toggle.messages";

export function LocaleToggle() {
  const activeLocale = useAppLocale();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full text-base leading-none"
              onClick={() => setDialogOpen(true)}
            >
              <span aria-hidden="true">{getAppLocaleFlagEmoji(activeLocale)}</span>
              <span className="sr-only">
                <FormattedMessage {...localeToggleMessages.changeLanguage} />
              </span>
            </Button>
          }
        />
        <TooltipContent side="bottom" align="center">
          <FormattedMessage {...localeToggleMessages.changeLanguage} />
        </TooltipContent>
      </Tooltip>
      <LocaleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default LocaleToggle;
