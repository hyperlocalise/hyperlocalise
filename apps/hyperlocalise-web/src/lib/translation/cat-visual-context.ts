export type CatVisualContextMarker = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CatVisualContextScreenshot = {
  id: string;
  name: string | null;
  imageUrl: string;
  width: number | null;
  height: number | null;
  markers: CatVisualContextMarker[];
};

export type CatVisualContext = {
  screenshots: CatVisualContextScreenshot[];
};

export function pixelRectToPercentMarkers(input: {
  width: number | null | undefined;
  height: number | null | undefined;
  left: number;
  top: number;
  widthPx: number;
  heightPx: number;
}): CatVisualContextMarker | null {
  if (!input.width || !input.height || input.width <= 0 || input.height <= 0) {
    return null;
  }

  if (input.widthPx <= 0 || input.heightPx <= 0) {
    return null;
  }

  return {
    left: (input.left / input.width) * 100,
    top: (input.top / input.height) * 100,
    width: (input.widthPx / input.width) * 100,
    height: (input.heightPx / input.height) * 100,
  };
}
