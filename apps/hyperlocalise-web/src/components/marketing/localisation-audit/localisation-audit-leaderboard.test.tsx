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
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { LOCALISATION_AUDIT_LEADERBOARD_PAGE_SIZE } from "@/lib/localisation-audit/types";

import { LocalisationAuditLeaderboard } from "./localisation-audit-leaderboard";
import { localisationAuditLeaderboardEntries } from "./localisation-audit.fixture";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("LocalisationAuditLeaderboard", () => {
  it("does not offer show more when every score already fits on one page", () => {
    render(
      <LocalisationAuditLeaderboard locale="en" entries={localisationAuditLeaderboardEntries()} />,
    );

    expect(screen.getByText("Northstar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("reveals the next page of scores", async () => {
    const user = userEvent.setup();
    const extra = 3;
    const entries = localisationAuditLeaderboardEntries(
      LOCALISATION_AUDIT_LEADERBOARD_PAGE_SIZE + extra,
    );

    render(<LocalisationAuditLeaderboard locale="en" entries={entries} />);

    expect(screen.getAllByRole("link")).toHaveLength(LOCALISATION_AUDIT_LEADERBOARD_PAGE_SIZE);
    expect(screen.queryByText("Site 26")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(screen.getAllByRole("link")).toHaveLength(
      LOCALISATION_AUDIT_LEADERBOARD_PAGE_SIZE + extra,
    );
    expect(screen.getByText("Site 26")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});
