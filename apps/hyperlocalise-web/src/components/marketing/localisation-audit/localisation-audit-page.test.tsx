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

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { getLocalisationAuditFaqItems } from "./localisation-audit-faq-content";
import { LocalisationAuditPage } from "./localisation-audit-page";
import { localisationAuditLeaderboardEntries } from "./localisation-audit.fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string }) => <img alt={alt} {...props} />,
}));

describe("LocalisationAuditPage", () => {
  it("uses a keyword-led H1 and shows the same FAQ questions as structured data", () => {
    const items = getLocalisationAuditFaqItems("en");

    render(
      <IntlProvider locale="en" messages={{}} onError={() => undefined}>
        <LocalisationAuditPage locale="en" leaderboard={localisationAuditLeaderboardEntries()} />
      </IntlProvider>,
    );

    expect(screen.getByRole("heading", { name: "Free website localisation audit." })).toBeTruthy();
    expect(screen.getByText(/See how your brand travels/)).toBeTruthy();
    for (const item of items) {
      expect(screen.getByRole("button", { name: item.question })).toBeTruthy();
    }
  });
});
