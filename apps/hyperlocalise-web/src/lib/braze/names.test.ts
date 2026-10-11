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
  brazeContentBlockCopyName,
  brazeEmailCopyName,
  sanitizeBrazeContentBlockName,
  slugifyBrazePathSegment,
} from "./names";

describe("braze names", () => {
  it("builds locale-suffixed email copy names without touching the source", () => {
    expect(brazeEmailCopyName("Welcome email", "fr-FR")).toBe("Welcome email_fr-FR");
    expect(brazeEmailCopyName("Welcome email", "fr")).toBe("Welcome email_fr");
  });

  it("sanitizes Content Block names to Braze's allowed charset", () => {
    expect(sanitizeBrazeContentBlockName("Hero / Promo!")).toBe("Hero_Promo");
    expect(brazeContentBlockCopyName("Hero / Promo!", "pt-BR")).toBe("Hero_Promo_pt-BR");
  });

  it("slugifies source paths", () => {
    expect(slugifyBrazePathSegment("Welcome email", "item")).toBe("welcome-email");
  });
});
