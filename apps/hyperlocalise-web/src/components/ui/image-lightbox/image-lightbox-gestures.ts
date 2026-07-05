export const MIN_LIGHTBOX_SCALE = 1;
export const MAX_LIGHTBOX_SCALE = 5;
export const LIGHTBOX_ZOOM_STEP = 0.25;
export const LIGHTBOX_DOUBLE_TAP_ZOOM = 2;

export const TAP_MAX_DURATION_MS = 300;
export const TAP_MAX_DISTANCE_PX = 12;
export const DRAG_THRESHOLD_PX = 6;

export type Point = {
  x: number;
  y: number;
};

export type Translate = Point;

export function clampLightboxScale(value: number) {
  return Math.min(MAX_LIGHTBOX_SCALE, Math.max(MIN_LIGHTBOX_SCALE, value));
}

export function distanceBetweenPoints(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function centerBetweenPoints(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function translateForZoom(input: {
  viewportRect: DOMRect;
  anchor: Point;
  currentTranslate: Translate;
  currentScale: number;
  nextScale: number;
}): Translate {
  if (input.nextScale === MIN_LIGHTBOX_SCALE) {
    return { x: 0, y: 0 };
  }

  const offsetX = input.anchor.x - input.viewportRect.left - input.viewportRect.width / 2;
  const offsetY = input.anchor.y - input.viewportRect.top - input.viewportRect.height / 2;
  const scaleRatio = input.nextScale / input.currentScale;

  return {
    x: input.currentTranslate.x - offsetX * (scaleRatio - 1),
    y: input.currentTranslate.y - offsetY * (scaleRatio - 1),
  };
}
