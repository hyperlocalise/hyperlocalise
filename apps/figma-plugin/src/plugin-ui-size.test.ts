import { describe, expect, it } from "vite-plus/test";

import { clampPluginUiHeight, PLUGIN_UI_MAX_HEIGHT, PLUGIN_UI_MIN_HEIGHT } from "./plugin-ui-size";

describe("plugin-ui-size", () => {
  it("clamps height to plugin bounds", () => {
    expect(clampPluginUiHeight(50)).toBe(PLUGIN_UI_MIN_HEIGHT);
    expect(clampPluginUiHeight(400)).toBe(400);
    expect(clampPluginUiHeight(9999)).toBe(PLUGIN_UI_MAX_HEIGHT);
  });
});
