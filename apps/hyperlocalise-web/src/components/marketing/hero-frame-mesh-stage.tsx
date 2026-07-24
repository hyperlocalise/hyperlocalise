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

import { HeroFrame } from "./hero-frame";

export const SEAFOAM_MESH_GRADIENT_SRC = "/images/mesh/mesh-gradient-1784864145512.jpg";

type HeroFrameMeshStageProps = {
  className?: string;
  priority?: boolean;
};

export function HeroFrameMeshStage({ className, priority = false }: HeroFrameMeshStageProps) {
  return (
    <div
      className={cn(
        "relative left-1/2 w-screen max-w-[calc(100vw-2.5rem)] -translate-x-1/2 lg:max-w-[min(92rem,calc(100vw-5rem))]",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[1.5rem] shadow-[0_20px_48px_rgba(0,0,0,0.18)] sm:rounded-[2rem] sm:shadow-[0_32px_80px_rgba(0,0,0,0.22)]">
        <Image
          src={SEAFOAM_MESH_GRADIENT_SRC}
          alt=""
          aria-hidden
          fill
          priority={priority}
          sizes="(min-width: 1280px) 92rem, 100vw"
          className="object-cover object-center"
        />
        <div className="relative p-3 sm:p-5 lg:p-8 xl:p-10">
          <HeroFrame layout="contained" className="shadow-[0_24px_64px_rgba(0,0,0,0.28)]" />
        </div>
      </div>
    </div>
  );
}
