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
// @vitest-environment happy-dom

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Globe } from "./globe";

const MAX_FADE_FRAMES = 120;

const globeMocks = vi.hoisted(() => ({
  createGlobe: vi.fn(),
  update: vi.fn(),
  destroy: vi.fn(),
  resolvedTheme: "light",
  prefersReducedMotion: false,
}));

vi.mock("cobe", () => ({ default: globeMocks.createGlobe }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: globeMocks.resolvedTheme }),
}));

let frameCallbacks: FrameRequestCallback[] = [];

function runFrame() {
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  for (const callback of callbacks) {
    callback(0);
  }
}

function lastUpdate() {
  return globeMocks.update.mock.lastCall?.[0];
}

describe("Globe", () => {
  beforeEach(() => {
    globeMocks.resolvedTheme = "light";
    globeMocks.prefersReducedMotion = false;
    globeMocks.createGlobe.mockReturnValue({
      update: globeMocks.update,
      destroy: globeMocks.destroy,
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && globeMocks.prefersReducedMotion,
    }));
  });

  afterEach(() => {
    frameCallbacks = [];
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fades to the new theme colors without rebuilding the globe", () => {
    const { rerender } = render(<Globe />);
    expect(lastUpdate()).toMatchObject({ dark: 0, mapBrightness: 6 });

    globeMocks.resolvedTheme = "dark";
    act(() => rerender(<Globe />));
    runFrame();

    const firstFadeFrame = lastUpdate();
    expect(firstFadeFrame.dark).toBeGreaterThan(0);
    expect(firstFadeFrame.dark).toBeLessThan(1);

    let frames = 1;
    while (lastUpdate().dark !== 1 && frames < MAX_FADE_FRAMES) {
      runFrame();
      frames += 1;
    }

    expect(lastUpdate()).toMatchObject({
      dark: 1,
      diffuse: 1.2,
      mapBrightness: 1.2,
      baseColor: [0.3, 0.3, 0.3],
      glowColor: [0.1, 0.3, 0.8],
    });
    expect(frames).toBeGreaterThan(1);
    expect(globeMocks.createGlobe).toHaveBeenCalledTimes(1);
    expect(globeMocks.destroy).not.toHaveBeenCalled();
  });

  it("applies the new theme colors at once when reduced motion is requested", () => {
    globeMocks.prefersReducedMotion = true;
    const { rerender } = render(<Globe />);

    globeMocks.resolvedTheme = "dark";
    act(() => rerender(<Globe />));
    runFrame();

    expect(lastUpdate()).toMatchObject({
      dark: 1,
      diffuse: 1.2,
      mapBrightness: 1.2,
      baseColor: [0.3, 0.3, 0.3],
      glowColor: [0.1, 0.3, 0.8],
    });
  });
});
