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

import { buildVideoLocalizationPrompt, localizedVideoOutputFilename } from "./video-localization";

describe("video localization helpers", () => {
  it("builds a localized mp4 filename from the source name and locale", () => {
    expect(localizedVideoOutputFilename("hero.mp4", "fr-FR")).toBe("hero-fr-fr.mp4");
    expect(localizedVideoOutputFilename("hero", "ja")).toBe("hero-ja.mp4");
    expect(localizedVideoOutputFilename(undefined, "de")).toBe("video-de.mp4");
  });

  it("includes source and target locale in the Seedance prompt", () => {
    const prompt = buildVideoLocalizationPrompt({
      filename: "hero.mp4",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      instructions: "Keep the logo.",
    });

    expect(prompt).toContain("Use [Video 1] as the source");
    expect(prompt).toContain("Source locale: en-US");
    expect(prompt).toContain("Target locale: fr-FR");
    expect(prompt).toContain("User instructions: Keep the logo.");
    expect(prompt).toContain("Source filename: hero.mp4");
    expect(prompt).toContain("Localize on-screen text and spoken audio");
  });
});
