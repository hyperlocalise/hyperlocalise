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
  companyHeroImageSrc,
  founders,
  getCompanyPageCopy,
  startmateLogoSrc,
  startmateUrl,
} from "./company-page-content";

describe("company page content", () => {
  it("exposes Startmate and founder LinkedIn destinations", () => {
    expect(startmateUrl).toBe("https://www.startmate.com");
    expect(startmateLogoSrc).toBe("/images/startmate-logo.svg");
    expect(companyHeroImageSrc).toBe("/images/nasa-gyp1xkjZNg8-unsplash.jpg");
    expect(founders).toEqual([
      {
        id: "minh-cung",
        name: "Minh Cung",
        photoSrc: "/images/founders/minh-cung.jpg",
        linkedInUrl: "https://www.linkedin.com/in/minhcung/",
      },
      {
        id: "hans-bui",
        name: "Hans Bui",
        photoSrc: "/images/founders/hans-bui.jpg",
        linkedInUrl: "https://www.linkedin.com/in/hansbui/",
      },
    ]);
  });

  it("returns localized company page copy", () => {
    const copy = getCompanyPageCopy("en");

    expect(copy.headline).toBe(
      "Built by people who believe localisation connects the world",
    );
    expect(copy.requestDemo).toBe("Request a demo");
    expect(copy.backedByHeading).toBe("Backed by");
    expect(copy.startmateName).toBe("Startmate");
    expect(copy.foundersNoteHeading).toBe("A note from the founders");
    expect(copy.foundersNoteParagraphs).toHaveLength(13);
    expect(copy.foundersNoteParagraphs[0]).toBe(
      "One of us had the privilege of seeing localisation at its best.",
    );
    expect(copy.foundersNoteParagraphs[1]).toContain("Localisation Engineer at Canva");
    expect(copy.foundersNoteParagraphs[3]).toContain("Payment lead at Samsung");
    expect(copy.foundersNoteParagraphs[6]).toBe("That's why we started Hyperlocalise.");
    expect(copy.foundersNoteParagraphs[12]).toBe(
      "Because every language is another opportunity to connect people.",
    );
    expect(copy.teamHeading).toBe("Founders");
  });
});
