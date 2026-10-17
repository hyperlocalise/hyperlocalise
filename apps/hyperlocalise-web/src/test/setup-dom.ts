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
import { afterAll, afterEach } from "vite-plus/test";

const isDomEnvironment = typeof document !== "undefined";

// Files in a worker share one DOM window (`isolate: false`). Keep the
// environment's originals once per worker so they can be restored after each
// file, because setup files re-run for every file and would otherwise
// capture a previous file's replacement.
const PRISTINE_DOM_KEY = Symbol.for("hyperlocalise.test.pristineDomProperties");

type PristineProperty = {
  target: object;
  key: PropertyKey;
  descriptor: PropertyDescriptor | undefined;
  value: unknown;
};

if (isDomEnvironment) {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  afterEach(() => {
    cleanup();
  });

  const pristineProperties = capturePristineDomProperties([
    [window, "matchMedia"],
    [window, "innerWidth"],
    [window, "innerHeight"],
    [navigator, "clipboard"],
    [Element.prototype, "scrollIntoView"],
  ]);

  afterAll(() => {
    for (const { target, key, descriptor, value } of pristineProperties) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
      // Vitest exposes window globals through accessors that write to the
      // environment's window, so restoring the descriptor alone is not enough.
      if (Reflect.get(target, key) !== value) Reflect.set(target, key, value);
    }
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

function capturePristineDomProperties(
  properties: Array<[target: object, key: PropertyKey]>,
): PristineProperty[] {
  const store = globalThis as typeof globalThis & {
    [PRISTINE_DOM_KEY]?: { window: Window; properties: PristineProperty[] };
  };
  const existing = store[PRISTINE_DOM_KEY];
  if (existing?.window === window) return existing.properties;

  const captured = properties.map(([target, key]) => ({
    target,
    key,
    descriptor: Object.getOwnPropertyDescriptor(target, key),
    value: Reflect.get(target, key),
  }));
  store[PRISTINE_DOM_KEY] = { window, properties: captured };
  return captured;
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
    } as unknown as Animation;
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
}
