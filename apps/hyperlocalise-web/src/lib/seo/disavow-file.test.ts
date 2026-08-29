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

import { buildDisavowFile, DISAVOW_DOMAINS } from "./disavow-file";

describe("buildDisavowFile", () => {
  it("emits Google Search Console domain entries for each spam host", () => {
    const body = buildDisavowFile();

    expect(body.startsWith("# Google Search Console disavow file for hyperlocalise.com\n")).toBe(
      true,
    );
    expect(body).toContain("Upload at Search Console > Removals > Disavow links.");
    expect(DISAVOW_DOMAINS).toHaveLength(19);

    for (const domain of DISAVOW_DOMAINS) {
      expect(body).toContain(`domain:${domain}`);
    }

    expect(body).toContain("domain:backlinker.shop");
    expect(body).toContain("domain:buybacklinks.agency");
    expect(body).toContain("domain:quero.party");
  });

  it("deduplicates, lowercases, and sorts domain entries", () => {
    const body = buildDisavowFile(["Zeta.example", "alpha.example", "alpha.example", ""]);

    expect(body).toBe(`${header()}\ndomain:alpha.example\ndomain:zeta.example\n`);
  });
});

function header(): string {
  return `# Google Search Console disavow file for hyperlocalise.com
# Upload at Search Console > Removals > Disavow links.
# Hosting this file on the site does not apply it. Google only uses the copy you upload.
# These referring domains are paid-link / PBN spam shops.
`;
}
