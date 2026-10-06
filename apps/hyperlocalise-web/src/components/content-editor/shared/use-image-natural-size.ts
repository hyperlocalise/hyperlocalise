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
import { useEffect, useState } from "react";

export type ImageNaturalSize = { width: number; height: number };

export function useImageNaturalSize(src: string | null | undefined): ImageNaturalSize | null {
  const [size, setSize] = useState<(ImageNaturalSize & { src: string }) | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setSize({ src, width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [src]);

  return size && size.src === src ? { width: size.width, height: size.height } : null;
}
