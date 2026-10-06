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
import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import { DomainsPageStore } from "./domains-page-store";

const linkedDomainFixture = (): LinkedDomainPublic => ({
  id: "ld_test",
  organizationId: "org_test",
  domainKey: "acme.com",
  domainSlug: "acme-com",
  sourceUrl: "https://acme.com",
  marketIds: ["france-fr"],
  status: "verified",
  preferredMethod: null,
  verifiedMethod: "dns_txt",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  localisationAuditId: null,
  projectId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  challenges: {
    token: "hyperlocalise-site-verification=test",
    dnsTxt: { host: "_hyperlocalise-verify", value: "hyperlocalise-site-verification=test" },
    htmlFile: {
      path: "/.well-known/hyperlocalise-verification.txt",
      url: "https://acme.com/.well-known/hyperlocalise-verification.txt",
      body: "hyperlocalise-site-verification=test",
    },
    metaTag: {
      html: '<meta name="hyperlocalise-site-verification" content="hyperlocalise-site-verification=test" />',
    },
  },
  auditScore: null,
});

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

  it("opens the add-domain dialog for new domains and edit mode for locales", () => {
    const store = new DomainsPageStore("acme");
    const linkedDomain = linkedDomainFixture();

    store.openAddDomainDialog();
    expect(store.addDomainDialogOpen).toBe(true);
    expect(store.editLinkedDomain).toBeNull();

    store.setAddDomainDialogOpen(false);
    store.openEditLocales(linkedDomain);
    expect(store.addDomainDialogOpen).toBe(true);
    expect(store.editLinkedDomain).toEqual(linkedDomain);
  });
});
