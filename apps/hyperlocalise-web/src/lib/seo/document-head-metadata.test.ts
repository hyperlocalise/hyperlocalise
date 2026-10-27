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

import { getDocumentHeadMetadataReport } from "./document-head-metadata";

const goodHead = `<!DOCTYPE html><html><head>
<title>Example</title>
<meta name="description" content="Summary" />
<link rel="canonical" href="https://example.com/en" />
<link rel="alternate" hreflang="en" href="https://example.com/en" />
</head><body><p>Hi</p></body></html>`;

describe("getDocumentHeadMetadataReport", () => {
  it("passes when title, description, canonical, and hreflang are only in head", () => {
    expect(getDocumentHeadMetadataReport(goodHead)).toEqual({ ok: true, issues: [] });
  });

  it("fails when metadata is streamed into the body", () => {
    const streamed = `<!DOCTYPE html><html><head></head><body>
<title>Example</title>
<meta name="description" content="Summary" />
<link rel="canonical" href="https://example.com/en" />
<link rel="alternate" hreflang="en" href="https://example.com/en" />
</body></html>`;

    const report = getDocumentHeadMetadataReport(streamed);
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(["title", "description", "canonical", "hreflang"]);
  });
});
