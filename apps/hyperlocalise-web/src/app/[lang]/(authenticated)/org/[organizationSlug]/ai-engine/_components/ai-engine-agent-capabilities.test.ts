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
  hyperlocaliseImageModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseVideoModelId,
} from "@/lib/providers/managed-model-ids";

import {
  getAgentCapabilityModelSource,
  getIncludedAgentCapabilityModel,
  isIncludedAgentCapabilityId,
} from "./ai-engine-agent-capabilities";

describe("ai engine agent capabilities", () => {
  it("keeps ask, translation, and coding on the workspace default", () => {
    expect(getAgentCapabilityModelSource("ask")).toBe("workspace-default");
    expect(getAgentCapabilityModelSource("translation")).toBe("workspace-default");
    expect(getAgentCapabilityModelSource("coding")).toBe("workspace-default");
    expect(isIncludedAgentCapabilityId("ask")).toBe(false);
  });

  it("uses included models for speech, image, and video", () => {
    expect(getAgentCapabilityModelSource("tts")).toBe("included");
    expect(getIncludedAgentCapabilityModel("tts")).toBe(hyperlocaliseTtsModelId);
    expect(getIncludedAgentCapabilityModel("transcribe")).toBe(hyperlocaliseTranscribeModelId);
    expect(getIncludedAgentCapabilityModel("image")).toBe(hyperlocaliseImageModelId);
    expect(getIncludedAgentCapabilityModel("video")).toBe(hyperlocaliseVideoModelId);
  });
});
