// @vitest-environment happy-dom
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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CAT_GLOSSARY_GUIDANCE_OPEN_EVENT,
  EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS,
  getCatGlossaryGuidanceServerSnapshot,
  getCatGlossaryGuidanceStatus,
  requestCatGlossaryGuidance,
  setCatGlossaryGuidanceStatus,
  subscribeCatGlossaryGuidance,
} from "./cat-glossary-guidance-event";

describe("cat-glossary-guidance-event", () => {
  afterEach(() => {
    setCatGlossaryGuidanceStatus(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
  });

  it("updates status and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatGlossaryGuidance(listener);

    setCatGlossaryGuidanceStatus({ preferredCount: 2, notRecommendedCount: 1, matchCount: 3 });

    expect(getCatGlossaryGuidanceStatus()).toEqual({
      preferredCount: 2,
      notRecommendedCount: 1,
      matchCount: 3,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("skips notification when status is unchanged", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatGlossaryGuidance(listener);

    setCatGlossaryGuidanceStatus({ preferredCount: 1, notRecommendedCount: 0, matchCount: 1 });
    setCatGlossaryGuidanceStatus({ preferredCount: 1, notRecommendedCount: 0, matchCount: 1 });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatGlossaryGuidance(listener);

    unsubscribe();
    setCatGlossaryGuidanceStatus({ preferredCount: 3, notRecommendedCount: 2, matchCount: 4 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("dispatches the open event on request", () => {
    const handler = vi.fn();
    window.addEventListener(CAT_GLOSSARY_GUIDANCE_OPEN_EVENT, handler);

    requestCatGlossaryGuidance();

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(CAT_GLOSSARY_GUIDANCE_OPEN_EVENT, handler);
  });

  it("marks guidance available when only matchCount is set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCatGlossaryGuidance(listener);

    setCatGlossaryGuidanceStatus({ preferredCount: 0, notRecommendedCount: 0, matchCount: 2 });

    expect(getCatGlossaryGuidanceStatus()).toEqual({
      preferredCount: 0,
      notRecommendedCount: 0,
      matchCount: 2,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("returns an empty server snapshot", () => {
    setCatGlossaryGuidanceStatus({ preferredCount: 4, notRecommendedCount: 1, matchCount: 2 });
    expect(getCatGlossaryGuidanceServerSnapshot()).toEqual(EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS);
  });
});
