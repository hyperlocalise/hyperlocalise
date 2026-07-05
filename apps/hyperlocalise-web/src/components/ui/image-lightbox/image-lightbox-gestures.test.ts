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
