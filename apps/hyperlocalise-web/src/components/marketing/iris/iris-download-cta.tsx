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
import { AppleLogoIcon, CaretDownIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { irisMacDownloadUrl } from "@/lib/iris/iris-download";

// Browsers report Apple Silicon Macs as Intel, so the main button serves the
// Apple Silicon build and the menu beside it offers both builds.
export function IrisDownloadCta() {
  const intl = useIntl();

  return (
    <ButtonGroup>
      <Button
        className="h-12 px-6 text-base"
        nativeButton={false}
        render={<a download href={irisMacDownloadUrl("arm64")} />}
        size="lg"
        variant="secondary"
      >
        <AppleLogoIcon data-icon="inline-start" weight="fill" />
        <FormattedMessage {...irisPageMessages.downloadForMac} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={intl.formatMessage(irisPageMessages.moreMacDownloads)}
              className="h-12 w-11 border-s border-border/60"
              size="icon-lg"
              variant="secondary"
            />
          }
        >
          <CaretDownIcon weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a download href={irisMacDownloadUrl("arm64")} />}>
            <FormattedMessage {...irisPageMessages.downloadForAppleSiliconMac} />
          </DropdownMenuItem>
          <DropdownMenuItem render={<a download href={irisMacDownloadUrl("x64")} />}>
            <FormattedMessage {...irisPageMessages.downloadForIntelMac} />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
