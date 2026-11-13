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
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { CircleNotchIcon, type IconProps } from "@phosphor-icons/react";
import { spinnerMessages } from "@/components/ui/spinner.messages";

type SpinnerProps = IconProps;

function Spinner({ className, ...props }: SpinnerProps) {
  const intl = useIntl();

  return (
    <CircleNotchIcon
      role="status"
      aria-label={intl.formatMessage(spinnerMessages.loading)}
      className={cn("size-4 motion-safe:animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
