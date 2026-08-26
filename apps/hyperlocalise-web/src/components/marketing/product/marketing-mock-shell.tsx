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
import Image from "next/image";

import { cn } from "@/lib/primitives/cn";

export type MarketingMockVariant = "full" | "embedded";
export type MarketingMockMeshPosition = "left" | "right";

export function MarketingMockShell({
  visual,
  sidebar,
  aside,
  meshSrc,
  priority = false,
  variant = "full",
  meshPosition = "left",
  className,
}: {
  visual: ReactNode;
  sidebar?: ReactNode;
  aside?: ReactNode;
  meshSrc: string;
  priority?: boolean;
  variant?: MarketingMockVariant;
  meshPosition?: MarketingMockMeshPosition;
  className?: string;
}) {
  const showSidebar = variant === "full" && sidebar && !aside;
  const showAside = Boolean(aside);
  const isSplit = showSidebar || showAside;
  const meshOnRight = meshPosition === "right";

  const meshPanel = (
    <div
      className={cn(
        "relative min-h-[20rem] overflow-hidden",
        isSplit ? "border-b border-border md:min-h-[24rem] md:border-b-0" : "min-h-[22rem]",
        meshOnRight && isSplit && "md:border-l md:border-border",
      )}
    >
      <Image
        src={meshSrc}
        alt=""
        aria-hidden
        fill
        priority={priority}
        sizes={isSplit ? "(min-width: 768px) 36rem, 100vw" : "100vw"}
        className="pointer-events-none object-cover object-center"
      />
      {isSplit ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 bg-gradient-to-r from-transparent to-background",
            meshOnRight ? "left-0 w-16 md:w-24" : "right-0 w-16 md:w-24",
          )}
        />
      ) : null}
      <div className="relative flex h-full items-center p-5 sm:p-7 lg:p-8">{visual}</div>
    </div>
  );

  const secondaryPanel = showAside ? (
    <div className="relative flex flex-col justify-center bg-background p-6 sm:p-8 lg:p-10">
      {aside}
    </div>
  ) : showSidebar ? (
    <div className="relative bg-background">{sidebar}</div>
  ) : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-gray-alpha-100",
        className,
      )}
    >
      <div
        className={cn(
          "grid min-h-[22rem]",
          isSplit
            ? showAside
              ? "md:grid-cols-[0.95fr_1.35fr]"
              : "md:grid-cols-[1fr_1.4fr]"
            : "grid-cols-1",
        )}
      >
        {meshOnRight ? (
          <>
            {secondaryPanel}
            {meshPanel}
          </>
        ) : (
          <>
            {meshPanel}
            {secondaryPanel}
          </>
        )}
      </div>
    </div>
  );
}
