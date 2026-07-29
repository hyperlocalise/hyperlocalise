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
import { describe, expect, it } from "vite-plus/test";

import {
  clampLightboxScale,
  distanceBetweenPoints,
  MAX_LIGHTBOX_SCALE,
  MIN_LIGHTBOX_SCALE,
  translateForZoom,
} from "@/components/ui/image-lightbox/image-lightbox-gestures";

describe("image-lightbox-gestures", () => {
  it("clamps zoom scale within supported bounds", () => {
    expect(clampLightboxScale(0.5)).toBe(MIN_LIGHTBOX_SCALE);
    expect(clampLightboxScale(2)).toBe(2);
    expect(clampLightboxScale(10)).toBe(MAX_LIGHTBOX_SCALE);
  });

  it("computes distance between two points", () => {
    expect(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("keeps the zoom anchor fixed while scaling", () => {
    const viewportRect = {
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;

    const nextTranslate = translateForZoom({
      viewportRect,
      anchor: { x: 150, y: 100 },
      currentTranslate: { x: 0, y: 0 },
      currentScale: 1,
      nextScale: 2,
    });

    expect(nextTranslate.x).toBe(-50);
    expect(nextTranslate.y).toBe(0);
  });
});
