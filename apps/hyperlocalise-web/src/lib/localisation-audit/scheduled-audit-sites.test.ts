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

import { isErr } from "@/lib/primitives/result/results";

import { resolveDomainIdentity } from "./domain-slug";
import { SCHEDULED_LOCALISATION_AUDIT_SITES } from "./scheduled-audit-sites";

describe("SCHEDULED_LOCALISATION_AUDIT_SITES", () => {
  it("keeps an even catalog of unique, resolvable sites", () => {
    expect(SCHEDULED_LOCALISATION_AUDIT_SITES).toHaveLength(300);

    const names = SCHEDULED_LOCALISATION_AUDIT_SITES.map((site) => site.name);
    expect(new Set(names).size).toBe(names.length);

    const domainKeys: string[] = [];
    const countsByCategory = new Map<string, number>();
    for (const site of SCHEDULED_LOCALISATION_AUDIT_SITES) {
      const identity = resolveDomainIdentity(site.url);
      if (isErr(identity)) {
        throw new Error(`${site.name} has an invalid scheduled url: ${site.url}`);
      }
      domainKeys.push(identity.value.domainKey);
      countsByCategory.set(site.category, (countsByCategory.get(site.category) ?? 0) + 1);
    }

    expect(new Set(domainKeys).size).toBe(domainKeys.length);
    expect([...countsByCategory.values()]).toEqual(Array.from({ length: 10 }, () => 30));
  });
});
