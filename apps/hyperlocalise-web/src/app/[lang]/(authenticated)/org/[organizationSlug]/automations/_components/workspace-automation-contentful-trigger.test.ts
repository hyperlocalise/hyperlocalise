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

import { resolveContentfulTriggerContentTypes } from "./workspace-automation-contentful-trigger";

describe("resolveContentfulTriggerContentTypes", () => {
  it("shows the saved list while the connection is unknown", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["article"],
        connection: undefined,
      }),
    ).toEqual({ contentTypeIds: ["article"], any: false, differsFromConnection: false });
  });

  it("follows the connection when the automation accepts every type", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: [],
        connection: { contentTypeIds: ["article", "landingPage"] },
      }),
    ).toEqual({
      contentTypeIds: ["article", "landingPage"],
      any: false,
      differsFromConnection: false,
    });
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: [],
        connection: { contentTypeIds: [] },
      }),
    ).toEqual({ contentTypeIds: [], any: true, differsFromConnection: false });
  });

  it("drops saved types the connection no longer sends", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["article", "landingPage"],
        connection: { contentTypeIds: ["article", "faq"] },
      }),
    ).toEqual({ contentTypeIds: ["article"], any: false, differsFromConnection: true });
  });

  it("reports no starting type when the lists do not overlap", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["landingPage"],
        connection: { contentTypeIds: ["faq"] },
      }),
    ).toEqual({ contentTypeIds: [], any: false, differsFromConnection: true });
  });

  it("keeps the saved list when the connection sends every type", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["article"],
        connection: { contentTypeIds: [] },
      }),
    ).toEqual({ contentTypeIds: ["article"], any: false, differsFromConnection: true });
  });

  it("treats the same types in another order as in step", () => {
    expect(
      resolveContentfulTriggerContentTypes({
        savedContentTypeIds: ["landingPage", "article"],
        connection: { contentTypeIds: ["article", "landingPage"] },
      }),
    ).toEqual({
      contentTypeIds: ["landingPage", "article"],
      any: false,
      differsFromConnection: false,
    });
  });
});
