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
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { FormattedMessage } from "react-intl";

import { buttonVariants } from "@/components/ui/button";
import { buildAvailablePlansHref } from "@/lib/billing/plan-usage";
import { cn } from "@/lib/primitives/cn";

import { upgradePlanButtonMessages } from "./upgrade-plan-button.messages";

type UpgradePlanButtonProps = {
  organizationSlug: string;
  className?: string;
} & VariantProps<typeof buttonVariants>;

export function UpgradePlanButton({
  organizationSlug,
  variant = "default",
  size = "sm",
  className,
}: UpgradePlanButtonProps) {
  return (
    <Link
      href={buildAvailablePlansHref(organizationSlug)}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      <FormattedMessage {...upgradePlanButtonMessages.upgradePlan} />
    </Link>
  );
}
