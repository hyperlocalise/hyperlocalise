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
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MessageDescriptor } from "react-intl";
import { FormattedMessage } from "react-intl";

export function FeatureTeaserBenefits({ benefits }: { benefits: readonly MessageDescriptor[] }) {
  return (
    <ul className="space-y-2">
      {benefits.map((benefit) => (
        <li
          key={benefit.id}
          className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"
        >
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0 text-primary"
          />
          <FormattedMessage {...benefit} />
        </li>
      ))}
    </ul>
  );
}
