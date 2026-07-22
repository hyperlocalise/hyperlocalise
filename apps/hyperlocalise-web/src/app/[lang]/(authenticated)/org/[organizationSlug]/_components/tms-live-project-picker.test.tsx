/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { TmsLiveProjectPicker } from "./tms-live-project-picker";

const useTmsLiveProjectsMock = vi.fn();

vi.mock("../_hooks/use-tms-live-projects", () => ({
  useTmsLiveProjects: (...args: unknown[]) => useTmsLiveProjectsMock(...args),
}));

describe("TmsLiveProjectPicker", () => {
  beforeEach(() => {
    useTmsLiveProjectsMock.mockReset();
  });

  it("shows the project name in the trigger instead of the raw external id", () => {
    useTmsLiveProjectsMock.mockReturnValue({
      data: [
        {
          id: "provider:crowdin:902807",
          name: "Marketing website",
          externalProjectId: "902807",
          isActive: true,
        },
      ],
      isLoading: false,
    });

    render(
      <IntlProvider locale="en" messages={{}}>
        <TmsLiveProjectPicker
          organizationSlug="acme"
          value="902807"
          onValueChange={() => undefined}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("Marketing website")).toBeInTheDocument();
    expect(screen.queryByText("902807")).not.toBeInTheDocument();
  });
});
