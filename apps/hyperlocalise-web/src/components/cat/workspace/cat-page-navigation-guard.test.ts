import { describe, expect, it, vi } from "vite-plus/test";

import {
  attemptCatPageNavigation,
  type CatPageNavigationGuardRef,
} from "./cat-page-navigation-guard";

describe("attemptCatPageNavigation", () => {
  it("runs proceed immediately when no guard is registered", () => {
    const proceed = vi.fn();

    attemptCatPageNavigation(undefined, proceed);

    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("delegates to the registered guard", () => {
    const proceed = vi.fn();
    const guard = vi.fn((next: () => void) => next());
    const guardRef = { current: guard } satisfies CatPageNavigationGuardRef;

    attemptCatPageNavigation(guardRef, proceed);

    expect(guard).toHaveBeenCalledWith(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("blocks proceed when the guard does not call it", () => {
    const proceed = vi.fn();
    const guardRef = {
      current: () => {},
    } satisfies CatPageNavigationGuardRef;

    attemptCatPageNavigation(guardRef, proceed);

    expect(proceed).not.toHaveBeenCalled();
  });
});
