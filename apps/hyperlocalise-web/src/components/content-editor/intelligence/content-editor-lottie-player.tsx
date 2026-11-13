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
import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";
import type { LottiePayload } from "@/lib/translation/lottie/lottie-document";

export function ContentEditorLottiePlayer({
  animationData,
  isLoading = false,
  className,
  emptyLabel,
}: {
  animationData: LottiePayload | null;
  isLoading?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (!containerRef.current || !animationData) {
      animationRef.current?.destroy();
      animationRef.current = null;
      return;
    }

    let cancelled = false;
    void import("lottie-web/build/player/lottie_light").then((module) => {
      if (cancelled || !containerRef.current) {
        return;
      }
      animationRef.current?.destroy();
      animationRef.current = module.default.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
      });
    });

    return () => {
      cancelled = true;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [animationData]);

  if (isLoading) {
    return <Skeleton className={cn("aspect-square w-full max-w-sm rounded-xl", className)} />;
  }

  if (!animationData) {
    return (
      <div
        className={cn(
          "flex aspect-square w-full max-w-sm items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyLabel ?? null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-border bg-muted/20",
        className,
      )}
    />
  );
}
