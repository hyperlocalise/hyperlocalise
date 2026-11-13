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
import type { CSSProperties } from "react";

import {
  BLUSH_MESH_GRADIENT_SRC,
  DUSK_MESH_GRADIENT_SRC,
  LAVENDER_MESH_GRADIENT_SRC,
  MIST_MESH_GRADIENT_SRC,
  ROSE_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
  SEAFOAM_MESH_GRADIENT_SRC,
} from "@/components/marketing/hero-frame-mesh-stage";
import { cn } from "@/lib/primitives/cn";

const USE_CASE_MESH_BY_SLUG: Record<string, { hero: string; accent: string }> = {
  "product-localisation": { hero: LAVENDER_MESH_GRADIENT_SRC, accent: BLUSH_MESH_GRADIENT_SRC },
  "marketing-localisation": { hero: BLUSH_MESH_GRADIENT_SRC, accent: ROSE_MESH_GRADIENT_SRC },
  "help-center-localisation": { hero: SAGE_MESH_GRADIENT_SRC, accent: SEAFOAM_MESH_GRADIENT_SRC },
  "github-release-localisation": {
    hero: DUSK_MESH_GRADIENT_SRC,
    accent: LAVENDER_MESH_GRADIENT_SRC,
  },
  "localisation-quality-monitoring": {
    hero: MIST_MESH_GRADIENT_SRC,
    accent: SAGE_MESH_GRADIENT_SRC,
  },
  "localisation-operations": { hero: SEAFOAM_MESH_GRADIENT_SRC, accent: MIST_MESH_GRADIENT_SRC },
};

const DEFAULT_MESH = { hero: SEAFOAM_MESH_GRADIENT_SRC, accent: LAVENDER_MESH_GRADIENT_SRC };

/** Mesh gradients for a use case: `hero` behind the hero, `accent` behind the closing CTA. */
export function getUseCaseMesh(slug: string) {
  return USE_CASE_MESH_BY_SLUG[slug] ?? DEFAULT_MESH;
}

const DOT_SPACING_PX = 22;

const DOT_FADE_MASKS = {
  radial: "radial-gradient(ellipse 75% 65% at 50% 45%, #000 25%, transparent 100%)",
  top: "linear-gradient(to bottom, #000 0%, transparent 85%)",
  bottom: "linear-gradient(to top, #000 0%, transparent 85%)",
  none: undefined,
} as const;

type DotGridProps = {
  /** `light` is for dots drawn over a dark mesh; `default` follows the theme foreground. */
  tone?: "default" | "light";
  fade?: keyof typeof DOT_FADE_MASKS;
  className?: string;
};

/** Decorative dot grid. Place inside a `relative isolate` parent. */
export function DotGrid({ tone = "default", fade = "radial", className }: DotGridProps) {
  const mask = DOT_FADE_MASKS[fade];
  const style: CSSProperties = {
    backgroundImage: "radial-gradient(circle at center, var(--dot-color) 1px, transparent 1.6px)",
    backgroundSize: `${DOT_SPACING_PX}px ${DOT_SPACING_PX}px`,
    backgroundPosition: "center top",
    maskImage: mask,
    WebkitMaskImage: mask,
  };

  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10",
        tone === "light"
          ? "[--dot-color:rgb(255_255_255/0.32)]"
          : "[--dot-color:color-mix(in_oklch,var(--foreground)_18%,transparent)]",
        className,
      )}
    />
  );
}
