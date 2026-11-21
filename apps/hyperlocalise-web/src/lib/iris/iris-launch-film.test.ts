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
import { describe, expect, it } from "vite-plus/test";

import {
  IRIS_LAUNCH_YOUTUBE_ID,
  IRIS_LAUNCH_YOUTUBE_WATCH_URL,
  irisLaunchEmbedSrc,
  irisLaunchPosterSrc,
} from "./iris-launch-film";

describe("iris launch film links", () => {
  it("points the launch film at the public YouTube watch page", () => {
    expect(IRIS_LAUNCH_YOUTUBE_WATCH_URL).toBe(
      `https://www.youtube.com/watch?v=${IRIS_LAUNCH_YOUTUBE_ID}`,
    );
  });

  it("builds a muted looping YouTube cover embed", () => {
    const src = irisLaunchEmbedSrc();

    expect(src).toContain(`https://www.youtube.com/embed/${IRIS_LAUNCH_YOUTUBE_ID}?`);
    expect(src).toContain("autoplay=1");
    expect(src).toContain("mute=1");
    expect(src).toContain("loop=1");
    expect(src).toContain(`playlist=${IRIS_LAUNCH_YOUTUBE_ID}`);
    expect(src).toContain("controls=0");
    expect(src).toContain("cc_load_policy=0");
    expect(src).toContain("enablejsapi=1");
    expect(irisLaunchEmbedSrc(IRIS_LAUNCH_YOUTUBE_ID, "https://hyperlocalise.com")).toContain(
      "origin=https%3A%2F%2Fhyperlocalise.com",
    );
  });

  it("uses the YouTube poster as a still fallback", () => {
    expect(irisLaunchPosterSrc()).toBe(
      `https://i.ytimg.com/vi/${IRIS_LAUNCH_YOUTUBE_ID}/maxresdefault.jpg`,
    );
  });
});
