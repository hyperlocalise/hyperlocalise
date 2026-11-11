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
import { FormattedMessage } from "react-intl";

import { marketingConversionCtaMessages } from "./marketing-conversion-cta-buttons.messages";
import { REQUEST_DEMO_URL } from "./request-demo";
import { Button } from "@/components/ui/button";

type MarketingConversionCtaButtonsProps = {
  className?: string;
  primaryButtonClassName?: string;
};

export function MarketingConversionCtaButtons({
  className,
  primaryButtonClassName,
}: MarketingConversionCtaButtonsProps) {
  return (
    <div className={className ?? "flex flex-col items-center justify-center gap-3 sm:flex-row"}>
      <Button
        className={primaryButtonClassName}
        nativeButton={false}
        render={<a href="/auth/sign-in" rel="noopener noreferrer" />}
      >
        <FormattedMessage {...marketingConversionCtaMessages.startForFree} />
      </Button>
      <Button
        nativeButton={false}
        render={<a href={REQUEST_DEMO_URL} rel="noopener noreferrer" target="_blank" />}
        variant="outline"
      >
        <FormattedMessage {...marketingConversionCtaMessages.requestDemo} />
      </Button>
    </div>
  );
}
