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
import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { buttonVariants } from "@/components/ui/button";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";

export function AiFeatureAction({
  organizationSlug,
  children,
  variant,
  size,
  className,
}: {
  organizationSlug: string;
  children: ReactNode;
  className?: string;
} & VariantProps<typeof buttonVariants>) {
  const access = useAiFeaturesAccess();

  if (access.status === "loading") {
    return null;
  }

  if (access.status === "denied") {
    return (
      <UpgradePlanButton
        organizationSlug={organizationSlug}
        variant={variant}
        size={size}
        className={className}
      />
    );
  }

  return children;
}
