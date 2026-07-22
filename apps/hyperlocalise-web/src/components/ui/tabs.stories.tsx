/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-8 p-6">
      <Tabs defaultValue="source">
        <TabsList variant="default">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
        <TabsContent value="source">Source strings grouped by file.</TabsContent>
        <TabsContent value="review">Reviewer assignments and approvals.</TabsContent>
      </Tabs>
      <Tabs defaultValue="line" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="line">Line</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="line">Line variant with vertical orientation.</TabsContent>
      </Tabs>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Source")).toBeInTheDocument();
  },
};
