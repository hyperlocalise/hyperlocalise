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

import { getResearchPrototypeDomain } from "@/lib/domains/research-prototype";

import { DomainsPageStore } from "./domains-page-store";

describe("DomainsPageStore", () => {
  it("tracks empty and populated list states", () => {
    const store = new DomainsPageStore("acme");
    store.setLoadStatus("success");
    expect(store.isEmpty).toBe(true);
    expect(store.hasDomains).toBe(false);

    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    store.setDomains([domain]);
    expect(store.isEmpty).toBe(false);
    expect(store.hasDomains).toBe(true);
  });

  it("opens the link dialog for new domains and edit mode for locales", () => {
    const store = new DomainsPageStore("acme");
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;

    store.openLinkDialog();
    expect(store.linkDialogOpen).toBe(true);
    expect(store.linkDialogDomain).toBeUndefined();

    store.setLinkDialogOpen(false);
    store.openEditLocales(domain);
    expect(store.linkDialogOpen).toBe(true);
    expect(store.linkDialogDomain).toEqual(domain);
  });

  it("builds the org link-domain path from a hostname", () => {
    const store = new DomainsPageStore("acme");
    expect(store.linkDomainPath("shop.example.com")).toMatch(/^\/org\/acme\/link-domain\/[a-z-]+$/);
  });
});
