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
import { describe, expect, it } from "vite-plus/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function InspectorTabs({ orientation }: { orientation?: "horizontal" | "vertical" }) {
  return (
    <Tabs defaultValue="details" orientation={orientation}>
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="details">Details panel</TabsContent>
      <TabsContent value="activity">Activity panel</TabsContent>
    </Tabs>
  );
}

describe("Tabs orientation", () => {
  it("moves between vertical tabs with up and down keys", async () => {
    const user = userEvent.setup();
    render(<InspectorTabs orientation="vertical" />);

    const list = screen.getByRole("tablist");
    const details = screen.getByRole("tab", { name: "Details" });
    const activity = screen.getByRole("tab", { name: "Activity" });

    expect(list).toHaveAttribute("aria-orientation", "vertical");
    expect(list.parentElement).toHaveAttribute("data-orientation", "vertical");

    details.focus();
    await user.keyboard("{ArrowDown}");
    expect(activity).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(details).toHaveFocus();
  });

  it("keeps horizontal arrow keys when orientation is omitted", async () => {
    const user = userEvent.setup();
    render(<InspectorTabs />);

    const list = screen.getByRole("tablist");
    const details = screen.getByRole("tab", { name: "Details" });
    const activity = screen.getByRole("tab", { name: "Activity" });

    expect(list).not.toHaveAttribute("aria-orientation", "vertical");

    details.focus();
    await user.keyboard("{ArrowRight}");
    expect(activity).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(activity).toHaveFocus();
  });
});
