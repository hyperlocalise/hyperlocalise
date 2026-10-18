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

import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { IrisVideoBackground } from "./iris-video-background";
import { irisLaunchEmbedSrc, irisLaunchPosterSrc } from "@/lib/iris/iris-waitlist";

const useReducedMotionMock = vi.hoisted(() => vi.fn(() => false as boolean | null));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

function renderBackground() {
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => undefined}>
      <IrisVideoBackground />
    </IntlProvider>,
  );
}

describe("IrisVideoBackground", () => {
  it("does not emit an autoplay iframe during SSR", () => {
    useReducedMotionMock.mockReturnValue(false);

    const html = renderToString(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <IrisVideoBackground />
      </IntlProvider>,
    );

    expect(html).toContain(irisLaunchPosterSrc());
    expect(html).not.toContain("<iframe");
  });

  it("mounts the autoplay embed after the client allows motion", async () => {
    useReducedMotionMock.mockReturnValue(false);

    renderBackground();

    await waitFor(() => {
      expect(document.querySelector("iframe")).toHaveAttribute("src", irisLaunchEmbedSrc());
    });
  });

  it("keeps the poster when the client prefers reduced motion", async () => {
    useReducedMotionMock.mockReturnValue(true);

    renderBackground();

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "Iris launch film playing in the background" }),
      ).toBeInTheDocument();
    });
    expect(document.querySelector("iframe")).toBeNull();
  });
});
