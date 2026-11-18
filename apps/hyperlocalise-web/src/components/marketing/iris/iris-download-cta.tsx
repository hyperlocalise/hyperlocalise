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
import { AppleLogoIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import { Button } from "@/components/ui/button";
import { irisMacDownloadUrl } from "@/lib/iris/iris-download";

// Browsers report Apple Silicon Macs as Intel, so the main button serves the
// Apple Silicon build and Intel owners get a separate link.
export function IrisDownloadCta() {
  return (
    <>
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
      <Button
        className="text-white"
        nativeButton={false}
        render={<a download href={irisMacDownloadUrl("x64")} />}
        size="sm"
        variant="link"
      >
        <FormattedMessage {...irisPageMessages.downloadForIntelMac} />
      </Button>
    </>
  );
}
