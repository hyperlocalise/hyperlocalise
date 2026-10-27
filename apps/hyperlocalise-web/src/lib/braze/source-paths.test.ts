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
  isBrazeCampaignSourcePath,
  isBrazeSourcePath,
  isBrazeTemplateSourcePath,
} from "./source-paths";

describe("braze source path helpers", () => {
  it("classifies campaign and Canvas paths without server-only imports", () => {
    expect(isBrazeCampaignSourcePath("braze/campaigns/welcome/email-a.json")).toBe(true);
    expect(isBrazeCampaignSourcePath("braze/canvas/onboarding/welcome/variant.json")).toBe(true);
    expect(isBrazeCampaignSourcePath("braze/templates/welcome-email.html")).toBe(false);
  });

  it("classifies template and content-block paths", () => {
    expect(isBrazeTemplateSourcePath("braze/templates/welcome-email.html")).toBe(true);
    expect(isBrazeTemplateSourcePath("braze/content-blocks/hero-promo.html")).toBe(true);
    expect(isBrazeTemplateSourcePath("braze/campaigns/welcome/email-a.json")).toBe(false);
  });

  it("matches any Braze CAT file", () => {
    expect(isBrazeSourcePath("braze/templates/welcome-email.html")).toBe(true);
    expect(isBrazeSourcePath("braze/campaigns/welcome/email-a.json")).toBe(true);
    expect(isBrazeSourcePath("locales/en.json")).toBe(false);
  });
});
