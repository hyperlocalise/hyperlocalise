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
import type { ReactNode } from "react";

import { cn } from "@/lib/primitives/cn";

/** Calm / shippable mesh — seafoam. */
export const PROJECT_OVERVIEW_CALM_MESH_SRC = "/images/mesh/mesh-gradient-1784864145512.jpg";
/** Action needed mesh — dusk. */
export const PROJECT_OVERVIEW_ACTION_MESH_SRC = "/images/mesh/mesh-gradient-1784863799475.jpg";

export function ProjectOverviewMeshStage({
  tone,
  children,
  className,
}: {
  tone: "action" | "calm";
  children: ReactNode;
  className?: string;
}) {
  const meshSrc =
    tone === "action" ? PROJECT_OVERVIEW_ACTION_MESH_SRC : PROJECT_OVERVIEW_CALM_MESH_SRC;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border shadow-sm",
        className,
      )}
    >
      <Image
        src={meshSrc}
        alt=""
        aria-hidden
        fill
        sizes="(min-width: 1024px) 56rem, 100vw"
        className="object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-background/92 via-background/82 to-background/70 dark:from-background/88 dark:via-background/78 dark:to-background/62"
      />
      <div className="relative px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </div>
  );
}
