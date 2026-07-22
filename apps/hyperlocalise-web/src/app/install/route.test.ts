/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { GET } from "./route";

describe("GET /install", () => {
  it("redirects browser requests to the install docs", () => {
    const request = new Request("https://hyperlocalise.com/install", {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const response = GET(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://hyperlocalise.dev/getting-started/install",
    );
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("redirects non-html requests to the installer script", () => {
    const request = new Request("https://hyperlocalise.com/install", {
      headers: {
        accept: "*/*",
      },
    });

    const response = GET(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh",
    );
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("defaults requests without an accept header to the installer script", () => {
    const request = new Request("https://hyperlocalise.com/install");

    const response = GET(request);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://raw.githubusercontent.com/hyperlocalise/hyperlocalise/main/install.sh",
    );
    expect(response.headers.get("vary")).toBe("Accept");
  });
});
