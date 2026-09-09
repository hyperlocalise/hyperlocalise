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
  imageTextLayersSchema,
  imageTextLayerPrompt,
  readImageTextLayers,
  type ImageTextLayers,
} from "./image-text-layers";

const layers: ImageTextLayers = {
  version: 1,
  sourceHash: "hash-source",
  revision: "00000000-0000-4000-8000-000000000001",
  extractedAt: "2026-09-09T00:00:00.000Z",
  regions: [
    {
      id: "headline",
      text: "A little closer",
      bounds: { x: 0.1, y: 0.2, width: 0.6, height: 0.2 },
      translations: {
        fr: { text: "Un peu plus près", instructions: "Keep the friendly tone" },
        de: { text: "Ein Stück näher", instructions: "German context" },
      },
    },
  ],
};
describe("image text layer metadata", () => {
  it("reads only validated layers for the current image hash", () => {
    expect(readImageTextLayers({ imageTextLayers: layers }, "hash-source")).toEqual(layers);
    expect(readImageTextLayers({ imageTextLayers: layers }, "replaced-source")).toBeNull();
    expect(readImageTextLayers({ imageTextLayers: { version: 2 } }, "hash-source")).toBeNull();
    expect(readImageTextLayers({}, "hash-source")).toBeNull();
  });
  it("rejects duplicate regions and bounds outside the image", () => {
    expect(
      imageTextLayersSchema.safeParse({
        ...layers,
        regions: [...layers.regions, ...layers.regions],
      }).success,
    ).toBe(false);
    expect(
      imageTextLayersSchema.safeParse({
        ...layers,
        regions: [{ ...layers.regions[0], bounds: { x: 0.9, y: 0, width: 0.4, height: 0.2 } }],
      }).success,
    ).toBe(false);
  });
  it("adds only the requested locale's exact wording and region instructions", () => {
    const prompt = imageTextLayerPrompt(layers, "fr");
    expect(prompt).toContain("Un peu plus près");
    expect(prompt).toContain("Keep the friendly tone");
    expect(prompt).toContain('"bounds":{"x":0.1');
    expect(prompt).not.toContain("Ein Stück näher");
    expect(prompt).not.toContain("German context");
  });
  it("leaves other locales for automatic localisation and handles text-free images", () => {
    const prompt = imageTextLayerPrompt(layers, "vi");
    expect(prompt).toContain("A little closer");
    expect(prompt).not.toContain("Un peu plus près");
    expect(imageTextLayerPrompt({ ...layers, regions: [] }, "fr")).toBeNull();
  });
});
