"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HugeiconsProps } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { spinnerMessages } from "@/components/ui/spinner.messages";

type SpinnerProps = Omit<HugeiconsProps, "icon">;

function Spinner({ className, ...props }: SpinnerProps) {
  const intl = useIntl();

  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      role="status"
      aria-label={intl.formatMessage(spinnerMessages.loading)}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
