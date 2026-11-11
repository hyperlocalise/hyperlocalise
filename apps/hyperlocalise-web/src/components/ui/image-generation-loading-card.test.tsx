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
import { act, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ImageGenerationLoadingCard } from "./image-generation-loading-card";

function show(props: React.ComponentProps<typeof ImageGenerationLoadingCard> = {}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <ImageGenerationLoadingCard {...props} />
    </IntlProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ImageGenerationLoadingCard", () => {
  it("shows controlled progress and the output dimensions", () => {
    show({ width: 1024, height: 768, progress: 45 });

    const progressbar = screen.getByRole("progressbar", { name: "Generating image" });
    expect(progressbar).toHaveAttribute("aria-valuenow", "45");
    expect(progressbar).toHaveStyle({ aspectRatio: `${1024 / 768}` });
    expect(screen.getByText("1024 × 768")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("advances simulated progress without reaching completion", () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    show({ startedAt, expectedDurationMs: 10_000 });

    const progressbar = screen.getByRole("progressbar");
    expect(Number(progressbar.getAttribute("aria-valuenow"))).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const midway = Number(progressbar.getAttribute("aria-valuenow"));
    expect(midway).toBeGreaterThan(50);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(Number(progressbar.getAttribute("aria-valuenow"))).toBeLessThan(100);
  });

  it("omits the dimension pill when the size is unknown", () => {
    show({ progress: 10 });

    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });
});
