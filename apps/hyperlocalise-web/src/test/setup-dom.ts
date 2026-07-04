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
