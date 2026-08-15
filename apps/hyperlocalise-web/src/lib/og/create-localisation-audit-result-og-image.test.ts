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

import { createLocalisationAuditResultOgImage } from "./create-localisation-audit-result-og-image";

describe("createLocalisationAuditResultOgImage", () => {
  it("renders a PNG for a completed audit with dimension scores", async () => {
    const response = await createLocalisationAuditResultOgImage({
      domainKey: "acme.example",
      dimensionScores: {
        technical: 86,
        linguistic: 81,
        contextual: 76,
        visual: 68,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("image/png");
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it("renders N/A circles when dimension scores are missing", async () => {
    const response = await createLocalisationAuditResultOgImage({
      domainKey: "example.com",
      dimensionScores: null,
    });

    expect(response.status).toBe(200);
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
