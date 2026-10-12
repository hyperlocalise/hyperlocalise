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
  buildBrazeCampaignSourcePath,
  buildBrazeCanvasSourcePath,
  hashBrazeTranslationMap,
  isBrazeCampaignSourcePath,
  isBrazeTemplateSourcePath,
  parseBrazeTranslationMapJson,
  serializeBrazeTranslationMap,
} from "./translation-map";

describe("braze translation map", () => {
  it("round-trips JSON maps with stable hashes", () => {
    const serialized = serializeBrazeTranslationMap({
      id_1: "My name is Jacky",
      id_0: "Hello!",
    });
    expect(serialized).toBe(`{\n  "id_0": "Hello!",\n  "id_1": "My name is Jacky"\n}\n`);
    expect(parseBrazeTranslationMapJson(serialized)).toEqual({
      id_0: "Hello!",
      id_1: "My name is Jacky",
    });
    expect(hashBrazeTranslationMap({ id_1: "My name is Jacky", id_0: "Hello!" })).toBe(
      hashBrazeTranslationMap({ id_0: "Hello!", id_1: "My name is Jacky" }),
    );
  });

  it("builds campaign and Canvas JSON paths", () => {
    const campaignPath = buildBrazeCampaignSourcePath({
      campaignId: "camp-1",
      campaignName: "Welcome",
      messageVariationId: "var-1",
      variationName: "Email A",
    });
    expect(campaignPath).toMatch(
      /^braze\/campaigns\/welcome-[a-f0-9]{8}\/email-a-[a-f0-9]{8}\.json$/,
    );
    expect(isBrazeCampaignSourcePath(campaignPath)).toBe(true);
    expect(isBrazeTemplateSourcePath(campaignPath)).toBe(false);

    const canvasPath = buildBrazeCanvasSourcePath({
      workflowId: "canvas-1",
      canvasName: "Onboarding",
      stepId: "step-1",
      stepName: "Welcome email",
      messageVariationId: "var-2",
      variationName: "Variant",
    });
    expect(canvasPath).toMatch(
      /^braze\/canvas\/onboarding-[a-f0-9]{8}\/welcome-email-[a-f0-9]{8}\/variant-[a-f0-9]{8}\.json$/,
    );
    expect(isBrazeCampaignSourcePath(canvasPath)).toBe(true);
  });
});
