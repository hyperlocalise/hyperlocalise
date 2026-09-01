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
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const useCustomerMock = vi.hoisted(() => vi.fn());

vi.mock("autumn-js/react", () => ({
  useCustomer: useCustomerMock,
}));

import { useAiFeaturesAccess } from "./use-ai-features-access";

describe("useAiFeaturesAccess", () => {
  afterEach(() => {
    useCustomerMock.mockReset();
  });

  it("is loading while the Autumn customer is loading", () => {
    useCustomerMock.mockReturnValue({
      isLoading: true,
      error: null,
      data: null,
      check: vi.fn(),
    });

    const { result } = renderHook(() => useAiFeaturesAccess());

    expect(result.current.status).toBe("loading");
  });

  it("is allowed when Autumn reports the feature is enabled", () => {
    useCustomerMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { id: "cus_1" },
      check: () => ({ allowed: true }),
    });

    const { result } = renderHook(() => useAiFeaturesAccess());

    expect(result.current.status).toBe("allowed");
  });

  it("is denied when Autumn reports the feature is disabled", () => {
    useCustomerMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: { id: "cus_1" },
      check: () => ({ allowed: false }),
    });

    const { result } = renderHook(() => useAiFeaturesAccess());

    expect(result.current.status).toBe("denied");
  });

  it("is denied when customer data is missing", () => {
    useCustomerMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      check: vi.fn(),
    });

    const { result } = renderHook(() => useAiFeaturesAccess());

    expect(result.current.status).toBe("denied");
  });
});
