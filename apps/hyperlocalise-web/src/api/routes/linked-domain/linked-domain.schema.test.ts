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

import { createLinkedDomainBodySchema, verifyLinkedDomainBodySchema } from "./linked-domain.schema";

describe("create linked domain body schema", () => {
  it("accepts an explicitly empty marketIds list", () => {
    expect(
      createLinkedDomainBodySchema.safeParse({
        domain: "example.com",
        marketIds: [],
      }).success,
    ).toBe(true);
  });

  it("defaults omitted marketIds to an empty list for audit-based claims", () => {
    expect(
      createLinkedDomainBodySchema.parse({
        domainSlug: "example-com",
      }).marketIds,
    ).toEqual([]);
  });

  it("accepts explicit unassigned verification", () => {
    expect(verifyLinkedDomainBodySchema.parse({ method: "dns_txt", createProject: false })).toEqual(
      { method: "dns_txt", createProject: false },
    );
  });
});
