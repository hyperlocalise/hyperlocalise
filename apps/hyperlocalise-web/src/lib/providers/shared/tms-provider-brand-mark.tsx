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
import Image from "next/image";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";

type TmsProviderBrandMarkProps = {
  providerKind: string | null | undefined;
  compact?: boolean;
  colored?: boolean;
  className?: string;
};

export function TmsProviderBrandMark({
  providerKind,
  compact = false,
  colored = true,
  className,
}: TmsProviderBrandMarkProps) {
  const branding = getTmsProviderBranding(providerKind);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-1.5 text-foreground",
        compact ? "size-7" : "size-8",
        className,
      )}
    >
      {branding.icon ? (
        <SimpleBrandIcon
          icon={branding.icon}
          colored={colored}
          className={compact ? "size-4" : "size-5"}
        />
      ) : (
        <Image
          src={branding.logo}
          alt=""
          width={compact ? 18 : 20}
          height={compact ? 18 : 20}
          className="max-h-5 w-auto object-contain"
        />
      )}
    </span>
  );
}
