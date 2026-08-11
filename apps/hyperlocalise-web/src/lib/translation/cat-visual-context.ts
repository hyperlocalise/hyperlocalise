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
