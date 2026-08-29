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

import { DISAVOW_DOMAINS } from "@/lib/seo/disavow-file";

import { GET } from "./route";

describe("disavow.txt route", () => {
  it("returns a downloadable Google Search Console disavow file", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="disavow.txt"');
    expect(body.startsWith("# Google Search Console disavow file for hyperlocalise.com\n")).toBe(
      true,
    );
    expect(body).toContain(`domain:${DISAVOW_DOMAINS[0]}`);
    expect(body.split("\n").filter((line) => line.startsWith("domain:")).length).toBe(
      DISAVOW_DOMAINS.length,
    );
  });
});
