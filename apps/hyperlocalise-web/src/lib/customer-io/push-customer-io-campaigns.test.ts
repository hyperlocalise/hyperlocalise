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

import { buildCustomerIoResourceSourcePath } from "./push-customer-io-campaigns";

describe("buildCustomerIoResourceSourcePath", () => {
  it("builds html paths for email and in_app actions to match the importer", () => {
    expect(
      buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42", "email"),
    ).toBe("customer-io/campaigns/7/actions/42.html");
    expect(
      buildCustomerIoResourceSourcePath({ kind: "broadcast", id: "2", name: "x" }, "96", "Email"),
    ).toBe("customer-io/broadcasts/2/actions/96.html");
    expect(
      buildCustomerIoResourceSourcePath({ kind: "broadcast", id: "2", name: "x" }, "15", "in_app"),
    ).toBe("customer-io/broadcasts/2/actions/15.html");
    expect(
      buildCustomerIoResourceSourcePath(
        { kind: "newsletter", id: "10", name: "x" },
        "101",
        "email",
      ),
    ).toBe("customer-io/newsletters/10/contents/101.html");
    expect(
      buildCustomerIoResourceSourcePath(
        { kind: "transactional", id: "5", name: "x" },
        "201",
        "email",
      ),
    ).toBe("customer-io/transactional/5/contents/201.html");
  });

  it("builds json paths for non-email actions", () => {
    expect(
      buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42", "push"),
    ).toBe("customer-io/campaigns/7/actions/42.json");
    expect(buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42")).toBe(
      "customer-io/campaigns/7/actions/42.json",
    );
  });
});
