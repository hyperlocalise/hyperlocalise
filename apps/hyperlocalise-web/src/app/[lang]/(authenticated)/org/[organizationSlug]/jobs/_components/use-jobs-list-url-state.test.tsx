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

import { render, screen, waitFor } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { writeJobsViewMode } from "./jobs-view-helpers";
import { useJobsListUrlState } from "./use-jobs-list-url-state";

const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace }, search: "status=failed&search=home&tab=jobs" };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/project_website/jobs",
  useRouter: () => navigation.router,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const StoreProbe = observer(function StoreProbe() {
  const store = useJobsListUrlState("project_website");
  return <output data-testid="status">{store.statusFilter}</output>;
});

describe("useJobsListUrlState", () => {
  afterEach(() => {
    navigation.replace.mockReset();
    window.localStorage.clear();
  });

  it("replaces a filtered project URL when Board is restored", async () => {
    writeJobsViewMode("kanban");
    render(<StoreProbe />);

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("all"));
    expect(navigation.replace).toHaveBeenCalledWith(
      "/org/acme/projects/project_website/jobs?search=home&tab=jobs",
      { scroll: false },
    );
  });
});
