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

import { normalizeSourcePath } from "@/lib/file-storage/records";

import {
  isCustomerIoSourcePath,
  normalizeSourcePath as normalizeCustomerIoSourcePath,
} from "./source-path";

describe("customer-io source-path", () => {
  it("normalizes paths exactly like file-storage records", () => {
    const samples = [
      "customer-io/campaigns/7/actions/42.json",
      "customer-io\\broadcasts\\2\\actions\\96.html",
      "./customer-io/newsletters/10//contents/101.json",
    ];
    for (const sample of samples) {
      expect(normalizeCustomerIoSourcePath(sample)).toBe(normalizeSourcePath(sample));
    }
  });

  it("matches Customer.io message paths for Push and Ingest matching", () => {
    expect(isCustomerIoSourcePath("customer-io/broadcasts/1/actions/a1.json")).toBe(true);
    expect(isCustomerIoSourcePath("customer-io/campaigns/7/actions/42.html")).toBe(true);
    expect(isCustomerIoSourcePath("braze/templates/welcome-email.html")).toBe(false);
    expect(isCustomerIoSourcePath("locales/en.json")).toBe(false);
  });
});
