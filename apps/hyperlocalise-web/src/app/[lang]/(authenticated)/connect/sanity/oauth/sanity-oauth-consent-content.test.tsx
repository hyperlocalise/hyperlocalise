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
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { SanityOauthConsentContent } from "./sanity-oauth-consent-content";

type ConsentProps = {
  hasRequest: boolean;
  studioOrigin: string | null;
  connections: Array<{
    connectionId: string;
    displayName: string;
    enabled: boolean;
    organizationName: string;
    organizationSlug: string | null;
  }>;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string | null;
  }>;
};

function renderConsent(props: Partial<ConsentProps> = {}) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <SanityOauthConsentContent
        hasRequest
        studioOrigin="http://localhost:3333"
        connections={[]}
        organizations={[
          { organizationId: "org-1", organizationName: "Acme", organizationSlug: "acme" },
        ]}
        {...props}
      />
    </IntlProvider>,
  );
}

describe("SanityOauthConsentContent", () => {
  it("does not send editors to Integrations", () => {
    renderConsent();

    expect(screen.queryByRole("link", { name: /integrations/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow access" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a connection picker when enabled connections exist", () => {
    renderConsent({
      connections: [
        {
          connectionId: "conn-1",
          displayName: "Studio",
          enabled: true,
          organizationName: "Acme",
          organizationSlug: "acme",
        },
      ],
    });

    expect(screen.getByLabelText("Workspace connection")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace")).not.toBeInTheDocument();
  });

  it("shows a workspace picker only when there are multiple writable workspaces and no connections", () => {
    renderConsent({
      organizations: [
        { organizationId: "org-1", organizationName: "Acme", organizationSlug: "acme" },
        { organizationId: "org-2", organizationName: "Beta", organizationSlug: "beta" },
      ],
    });

    expect(screen.getByLabelText("Workspace")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace connection")).not.toBeInTheDocument();
  });
});
