/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
