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

import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { getContactPageCopy, supportEmailMailto } from "./contact-page-content";

describe("contact page content", () => {
  it("points the support button at the shared support email", () => {
    expect(supportEmailMailto).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it("returns localized contact page copy", () => {
    const copy = getContactPageCopy("en");

    expect(copy.headline).toBe("Talk with the Hyperlocalise team");
    expect(copy.subcopy).toContain("Email us and we will reply within one business day.");
    expect(copy.emailCta).toBe("Email support");
  });
});
