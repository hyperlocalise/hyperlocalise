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
  isCustomerIoLocaleImportComplete,
  isCustomerIoLocaleSeedComplete,
} from "./import-customer-io-campaigns";

describe("isCustomerIoLocaleImportComplete", () => {
  it("is complete when entries were imported and every source key has remote text", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 2,
      }),
    ).toBe(true);
  });

  it("is incomplete when nothing was imported", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello" },
        remoteMap: { title: "Bonjour" },
        importedCount: 0,
      }),
    ).toBe(false);
  });

  it("is incomplete when a source key has no remote text", () => {
    expect(
      isCustomerIoLocaleImportComplete({
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour" },
        importedCount: 1,
      }),
    ).toBe(false);
  });
});

describe("isCustomerIoLocaleSeedComplete", () => {
  it("never completes for email so the HTML body goes through Jobs", () => {
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "email",
        sourceMap: { subject: "Hello", body: "<p>World</p>" },
        remoteMap: { subject: "Bonjour", body: "<p>Monde</p>" },
        importedCount: 1,
      }),
    ).toBe(false);
  });

  it("defers to import completeness for non-email actions", () => {
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "push",
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 2,
      }),
    ).toBe(true);
    expect(
      isCustomerIoLocaleSeedComplete({
        actionType: "push",
        sourceMap: { title: "Hello", body: "World" },
        remoteMap: { title: "Bonjour", body: "Monde" },
        importedCount: 0,
      }),
    ).toBe(false);
  });
});
