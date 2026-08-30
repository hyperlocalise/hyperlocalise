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

import { cn } from "@/lib/primitives/cn";

type IntegrationLogoProps = {
  src: string;
  muted?: boolean;
  className?: string;
};

export function IntegrationLogo({ src, muted = false, className }: IntegrationLogoProps) {
  return (
    <Image
      src={src}
      alt=""
      width={20}
      height={20}
      className={cn("size-5 object-contain", muted && "opacity-75", className)}
    />
  );
}
