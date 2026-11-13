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
  intersectCustomerIoJobLocales,
  leftoverCustomerIoJobLocalesNotCoveredByOpenJobs,
} from "./job-locales";

describe("intersectCustomerIoJobLocales", () => {
  it("keeps leftover locales when the job uses project targets", () => {
    expect(intersectCustomerIoJobLocales(["fr-FR", "de-DE"], ["ja-JP"], true)).toEqual([
      "fr-FR",
      "de-DE",
    ]);
    expect(intersectCustomerIoJobLocales(["fr-FR", "de-DE"], ["ja-JP"], undefined)).toEqual([
      "fr-FR",
      "de-DE",
    ]);
    expect(intersectCustomerIoJobLocales(["fr-FR"], [], false)).toEqual(["fr-FR"]);
  });

  it("intersects configured native-job locales with underscore or case variants", () => {
    expect(intersectCustomerIoJobLocales(["fr-FR", "de-DE", "ja-JP"], ["ja-JP"], false)).toEqual([
      "ja-JP",
    ]);
    expect(intersectCustomerIoJobLocales(["fr_FR", "de-DE"], ["fr-fr"], false)).toEqual(["fr_FR"]);
  });
});

describe("leftoverCustomerIoJobLocalesNotCoveredByOpenJobs", () => {
  it("drops locales already covered by an open job on the same source file", () => {
    expect(
      leftoverCustomerIoJobLocalesNotCoveredByOpenJobs({
        leftoverLocales: ["fr-FR", "de-DE"],
        sourceFileId: "file_1",
        openJobs: [{ sourceFileId: "file_1", targetLocales: ["fr_FR"] }],
      }),
    ).toEqual(["de-DE"]);
  });

  it("ignores open jobs for a different source file", () => {
    expect(
      leftoverCustomerIoJobLocalesNotCoveredByOpenJobs({
        leftoverLocales: ["de-DE"],
        sourceFileId: "file_1",
        openJobs: [{ sourceFileId: "file_other", targetLocales: ["de-DE"] }],
      }),
    ).toEqual(["de-DE"]);
  });
});
