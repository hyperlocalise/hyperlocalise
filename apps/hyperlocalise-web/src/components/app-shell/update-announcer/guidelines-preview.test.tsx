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

import { render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { irisLaunchEmbedSrc } from "@/lib/iris/iris-waitlist";

import { GUIDELINE_LAUNCH_YOUTUBE_ID, GuidelinesPreview } from "./guidelines-preview";

const useReducedMotionMock = vi.hoisted(() => vi.fn(() => false as boolean | null));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

function renderPreview(container?: HTMLElement) {
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => undefined}>
      <GuidelinesPreview />
    </IntlProvider>,
    container ? { container } : undefined,
  );
}

describe("GuidelinesPreview", () => {
  it("does not emit an autoplay iframe during SSR", () => {
    useReducedMotionMock.mockReturnValue(false);

    const html = renderToString(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <GuidelinesPreview />
      </IntlProvider>,
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<img");
  });

  it("mounts the muted looping embed after the client allows motion", async () => {
    useReducedMotionMock.mockReturnValue(false);
    const container = document.createElement("div");
    renderPreview(container);

    await waitFor(() => {
      const iframe = container.querySelector("iframe");
      expect(iframe).toHaveAttribute(
        "src",
        irisLaunchEmbedSrc(GUIDELINE_LAUNCH_YOUTUBE_ID, window.location.origin),
      );
      expect(iframe).toHaveClass("pointer-events-none");
    });
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the poster when the client prefers reduced motion", async () => {
    useReducedMotionMock.mockReturnValue(true);
    const container = document.createElement("div");
    renderPreview(container);

    await waitFor(() => {
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        `https://i.ytimg.com/vi/${GUIDELINE_LAUNCH_YOUTUBE_ID}/maxresdefault.jpg`,
      );
    });
    expect(container.querySelector("iframe")).toBeNull();
  });
});
