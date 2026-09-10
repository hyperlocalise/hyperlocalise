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
import { render } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getResearchPrototypeDomain,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";
import { DomainResearchShell } from "./domain-research-shell";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: "locale=france-fr",
  domains: [] as DomainResearchDomain[],
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({
    push: vi.fn(),
    replace: mocks.replace,
  }),
}));

vi.mock("./use-domain-prototype", () => ({
  useDomainPrototype: () => ({
    domains: mocks.domains,
    saveDomain: vi.fn(),
  }),
}));

describe("domain research locale URL", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.search = "locale=france-fr";
    mocks.domains = [getResearchPrototypeDomain("hyperlocalise-com")!];
  });

  it("replaces a removed locale in the URL with the fallback locale", () => {
    const domain = getResearchPrototypeDomain("hyperlocalise-com")!;
    mocks.domains = [{ ...domain, locales: domain.locales.slice(1) }];
    render(
      <IntlProvider locale="en">
        <DomainResearchShell
          organizationSlug="acme"
          linkedDomainId="hyperlocalise-com"
          surface="overview"
        >
          research
        </DomainResearchShell>
      </IntlProvider>,
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      "/org/acme/domains/hyperlocalise-com?locale=germany-de",
      { scroll: false },
    );
  });

  it("keeps a supported locale in the URL", () => {
    render(
      <IntlProvider locale="en">
        <DomainResearchShell
          organizationSlug="acme"
          linkedDomainId="hyperlocalise-com"
          surface="overview"
        >
          research
        </DomainResearchShell>
      </IntlProvider>,
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
