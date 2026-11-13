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

import { navigateThroughLeaveGuard, registerLeaveGuard } from "./leave-guard";

describe("leave-guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates immediately when no guard is registered", () => {
    const proceed = vi.fn();
    navigateThroughLeaveGuard("/org/acme/automations", proceed);
    expect(proceed).toHaveBeenCalledWith({ replace: false });
  });

  it("hands the href and proceed callback to the active guard", () => {
    const proceed = vi.fn();
    const guard = vi.fn();
    const unregister = registerLeaveGuard(guard);

    navigateThroughLeaveGuard("/org/acme/projects", proceed);

    expect(guard).toHaveBeenCalledWith("/org/acme/projects", proceed);
    expect(proceed).not.toHaveBeenCalled();
    unregister();
  });

  it("clears only the same guard reference on unregister", () => {
    const first = vi.fn();
    const second = vi.fn();
    const proceed = vi.fn();
    const unregisterFirst = registerLeaveGuard(first);
    const unregisterSecond = registerLeaveGuard(second);

    unregisterFirst();
    navigateThroughLeaveGuard("/org/acme/settings", proceed);
    expect(second).toHaveBeenCalledWith("/org/acme/settings", proceed);
    expect(first).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();

    unregisterSecond();
    navigateThroughLeaveGuard("/org/acme/overview", proceed);
    expect(proceed).toHaveBeenCalledWith({ replace: false });
  });
});
