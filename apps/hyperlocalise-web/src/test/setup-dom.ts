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
import { afterEach } from "vite-plus/test";

const isDomEnvironment = typeof document !== "undefined";

if (isDomEnvironment) {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  afterEach(() => {
    cleanup();
  });

  // happy-dom 20.12+ implements Web Animations. Motion then calls
  // Animation.cancel(), which rejects `finished` as AbortError and Vitest
  // treats that unhandled rejection as a failed run.
  installNoopWebAnimations();

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

function installNoopWebAnimations() {
  const createNoopAnimation = (): Animation => {
    const animation = {
      id: "",
      currentTime: 0,
      startTime: 0,
      playbackRate: 1,
      playState: "idle" as AnimationPlayState,
      pending: false,
      replaceState: "active" as AnimationReplaceState,
      effect: null,
      timeline: null,
      onfinish: null,
      oncancel: null,
      onremove: null,
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      persist() {},
      reverse() {},
      updatePlaybackRate() {},
      commitStyles() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    } as Animation;
    Object.defineProperty(animation, "finished", {
      value: Promise.resolve(animation),
    });
    Object.defineProperty(animation, "ready", {
      value: Promise.resolve(animation),
    });
    return animation;
  };

  Element.prototype.animate = function () {
    return createNoopAnimation();
  };
  Element.prototype.getAnimations = () => [];
  document.getAnimations = () => [];

  if (typeof Animation === "undefined") {
    return;
  }

  const originalCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function (this: Animation) {
    void this.finished.catch(() => undefined);
    originalCancel.call(this);
  };
}
