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

import { getIntlShape } from "@/lib/app-i18n/intl";

import { getIrisRouteMetadata, irisRouteKeywords } from "./iris-route-metadata";

describe("getIrisRouteMetadata", () => {
  it("names Iris as an AI localisation engine for multilingual assets", () => {
    const metadata = getIrisRouteMetadata(getIntlShape("en"));

    expect(metadata.title).toBe(
      "Iris | AI Localisation Engine for Multilingual Assets | Hyperlocalise",
    );
    expect(metadata.description).toContain("AI localisation engine for multilingual assets");
    expect(metadata.description).toContain("images, video, motion, and audio");
    expect(metadata.ogHeading).toBe("Iris, the AI localisation engine");
    expect(metadata.keywords).toEqual(irisRouteKeywords);
  });
});
