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
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  getYouTubeEmbedSrc,
  getYouTubeVideoId,
  hasProductPreviewVideoUrl,
  PRODUCT_PREVIEW_VIDEO_URL,
  ProductPreviewVideo,
} from "./product-preview";

describe("hasProductPreviewVideoUrl", () => {
  it("accepts a non-empty url", () => {
    expect(hasProductPreviewVideoUrl("https://www.youtube.com/watch?v=wjDelLf57OM")).toBe(true);
    expect(hasProductPreviewVideoUrl("  ")).toBe(false);
    expect(hasProductPreviewVideoUrl("")).toBe(false);
    expect(hasProductPreviewVideoUrl(null)).toBe(false);
  });
});

describe("getYouTubeVideoId", () => {
  it("reads watch, share, embed, shorts, and live urls", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=wjDelLf57OM")).toBe("wjDelLf57OM");
    expect(getYouTubeVideoId("https://youtu.be/wjDelLf57OM?si=HZQk0LuSqYji94_R")).toBe(
      "wjDelLf57OM",
    );
    expect(getYouTubeVideoId("https://www.youtube.com/embed/wjDelLf57OM")).toBe("wjDelLf57OM");
    expect(getYouTubeVideoId("https://www.youtube.com/shorts/wjDelLf57OM")).toBe("wjDelLf57OM");
    expect(getYouTubeVideoId("https://www.youtube.com/live/wjDelLf57OM")).toBe("wjDelLf57OM");
    expect(getYouTubeVideoId("https://m.youtube.com/watch?v=wjDelLf57OM")).toBe("wjDelLf57OM");
  });

  it("rejects non-youtube or invalid ids", () => {
    expect(getYouTubeVideoId("https://cdn.example.com/preview.mp4")).toBeNull();
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(getYouTubeVideoId("not-a-url")).toBeNull();
    expect(getYouTubeVideoId("javascript:alert(1)")).toBeNull();
  });
});

describe("getYouTubeEmbedSrc", () => {
  it("builds a privacy-enhanced embed for the homepage hero url", () => {
    expect(getYouTubeEmbedSrc(PRODUCT_PREVIEW_VIDEO_URL)).toBe(
      "https://www.youtube-nocookie.com/embed/wjDelLf57OM",
    );
  });
});

describe("ProductPreviewVideo", () => {
  it("embeds the configured YouTube hero video", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <ProductPreviewVideo src={PRODUCT_PREVIEW_VIDEO_URL} />
      </IntlProvider>,
    );

    const frame = screen.getByTitle("Illustrative product preview");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/wjDelLf57OM");
    expect(screen.queryByRole("video")).not.toBeInTheDocument();
  });

  it("renders a file video when the url is not YouTube", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <ProductPreviewVideo src="https://cdn.example.com/preview.mp4" />
      </IntlProvider>,
    );

    expect(screen.getByLabelText("Illustrative product preview")).toHaveAttribute(
      "src",
      "https://cdn.example.com/preview.mp4",
    );
    expect(screen.queryByTitle("Illustrative product preview")).not.toBeInTheDocument();
  });
});
