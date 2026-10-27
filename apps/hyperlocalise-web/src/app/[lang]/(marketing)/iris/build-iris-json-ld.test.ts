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

import { buildIrisJsonLd } from "./build-iris-json-ld";

describe("buildIrisJsonLd", () => {
  it("describes Iris as a SoftwareApplication", () => {
    expect(buildIrisJsonLd("en")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Iris",
      alternateName: "Iris by Hyperlocalise",
      description:
        "Iris is Hyperlocalise's AI localisation engine for multilingual assets. Create and adapt images, video, motion, and audio for every language. Join the waitlist.",
      featureList: [
        "Multilingual image localisation",
        "Video localisation",
        "Motion localisation",
        "Audio localisation",
      ],
      inLanguage: "en",
      url: "https://www.hyperlocalise.com/en/iris",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Cloud",
      provider: {
        "@type": "Organization",
        name: "Hyperlocalise",
        url: "https://www.hyperlocalise.com",
      },
    });
  });
});
