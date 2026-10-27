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
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));

import { ApiResponseError } from "@/lib/api-error";

import { useAiCreditRefusalToast } from "./use-ai-credit-refusal-toast";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <IntlProvider locale="en" messages={{}}>
      {children}
    </IntlProvider>
  );
}

describe("useAiCreditRefusalToast", () => {
  it("shows a refusal for used-up AI credit and leaves other failures to the caller", () => {
    const { result } = renderHook(() => useAiCreditRefusalToast(), { wrapper });

    expect(result.current(new Error("unavailable"))).toBe(false);
    expect(toastErrorMock).not.toHaveBeenCalled();

    expect(
      result.current(new ApiResponseError("used up", { code: "ai_credit_exhausted", status: 402 })),
    ).toBe(true);
    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Your workspace has used all of its AI credit."),
    );
  });
});
