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
import Image from "next/image";

import type { IntegrationIconKey } from "@/lib/integrations/integration-catalog.types";
import { getIntegrationIconForKey } from "@/lib/integrations/integration-icons";
import { Box } from "@/components/ui/layout/box";
import { cn } from "@/lib/primitives/cn";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";

type IntegrationLogoMarkProps = {
  name: string;
  logoSrc?: string;
  iconKey?: IntegrationIconKey;
  size?: "sm" | "md" | "lg";
};

const containerClassNames = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
} as const;

const imageSizeClassNames = {
  sm: "size-5",
  md: "size-6",
  lg: "size-8",
} as const;

export function IntegrationLogoMark({
  name,
  logoSrc,
  iconKey,
  size = "md",
}: IntegrationLogoMarkProps) {
  const icon = iconKey ? getIntegrationIconForKey(iconKey) : undefined;

  return (
    <div className={cn("shrink-0", containerClassNames[size])}>
      <Box
        background="muted"
        border="standard"
        borderRadius="standard"
        display="flex"
        alignItems="center"
        justifyContent="center"
        width="full"
        height="full"
      >
        {logoSrc ? (
          <Image
            alt=""
            aria-hidden
            className={cn("object-contain", imageSizeClassNames[size])}
            height={32}
            src={logoSrc}
            width={32}
          />
        ) : icon ? (
          <SimpleBrandIcon className={imageSizeClassNames[size]} colored icon={icon} />
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">{name.slice(0, 1)}</span>
        )}
      </Box>
    </div>
  );
}
