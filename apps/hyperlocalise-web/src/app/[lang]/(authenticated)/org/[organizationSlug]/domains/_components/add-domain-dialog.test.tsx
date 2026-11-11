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

// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { LinkedDomainPublic } from "@/lib/linked-domains/types";

import { AddDomainDialog } from "./add-domain-dialog";

const updateLinkedDomainMarkets = vi.fn();

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      domains: {
        updateLinkedDomainMarkets,
      },
    },
    loading: false,
  }),
}));

const linkedDomain: LinkedDomainPublic = {
  id: "ld_acme",
  organizationId: "org_acme",
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
    token: "hyperlocalise-site-verification=acme",
    dnsTxt: { host: "_hyperlocalise-verify", value: "hyperlocalise-site-verification=acme" },
    htmlFile: {
      path: "/.well-known/hyperlocalise-verification.txt",
      url: "https://acme.com/.well-known/hyperlocalise-verification.txt",
      body: "hyperlocalise-site-verification=acme",
    },
    metaTag: {
      html: '<meta name="hyperlocalise-site-verification" content="hyperlocalise-site-verification=acme" />',
    },
  },
  auditScore: null,
};

describe("AddDomainDialog edit locales", () => {
  it("saves from the markets checklist without the project step", async () => {
    updateLinkedDomainMarkets.mockResolvedValue({
      linkedDomain: { ...linkedDomain, marketIds: ["france-fr", "germany-de"] },
    });
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <IntlProvider locale="en">
        <AddDomainDialog
          open
          onOpenChange={onOpenChange}
          organizationSlug="acme"
          mode="edit"
          initialStep="markets"
          initialLinkedDomain={linkedDomain}
          initialSelectedMarketIds={["france-fr"]}
          onComplete={onComplete}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Edit locales" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to project" })).not.toBeInTheDocument();
    expect(screen.queryByText("Domain details")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save markets" }));

    expect(updateLinkedDomainMarkets).toHaveBeenCalledWith("acme", "ld_acme", {
      marketIds: ["france-fr"],
    });
    expect(onComplete).toHaveBeenCalled();
  });
});
