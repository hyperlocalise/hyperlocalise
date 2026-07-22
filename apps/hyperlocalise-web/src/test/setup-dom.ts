/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { afterEach } from "vite-plus/test";

const isDomEnvironment = typeof document !== "undefined";

if (isDomEnvironment) {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  afterEach(() => {
    cleanup();
  });

  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }

  if (!("getAnimations" in document.documentElement)) {
    Object.defineProperty(document.documentElement, "getAnimations", {
      value: () => [],
    });
  }

  if (!globalThis.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  }

  const defaultRect = {
    width: 1280,
    height: 900,
    top: 0,
    left: 0,
    bottom: 900,
    right: 1280,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };

  Element.prototype.getBoundingClientRect = function () {
    return defaultRect as DOMRect;
  };
}
