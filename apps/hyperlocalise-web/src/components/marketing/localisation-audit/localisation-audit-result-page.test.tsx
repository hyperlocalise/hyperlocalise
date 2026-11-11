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
import { describe, expect, it, vi } from "vite-plus/test";

import { LocalisationAuditResultPage } from "./localisation-audit-result-page";
import { createSucceededAudit, localisationAuditStanding } from "./localisation-audit.fixture";

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: null, loading: false, featureFlags: {} }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string }) => <img alt={alt} {...props} />,
}));

describe("LocalisationAuditResultPage", () => {
  it("shows the rerun cooldown without crashing the report", () => {
    const audit = {
      ...createSucceededAudit(),
      rerunnable: false,
      rerunAvailableAt: "2026-08-02T12:00:00.000Z",
    };

    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <LocalisationAuditResultPage
          locale="en"
          domainSlug={audit.domainSlug}
          standing={localisationAuditStanding(audit.score ?? 0)}
          audit={audit}
        />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Acme" })).toBeTruthy();
    expect(screen.getByText(/You can re-run this audit once a day/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Re-run audit" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
