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

import { Button } from "./button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./button-group";

const meta = {
  title: "UI/Button Group",
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-6">
      <ButtonGroup orientation="horizontal">
        <Button variant="outline">Draft</Button>
        <Button variant="outline">Review</Button>
        <Button>Publish</Button>
      </ButtonGroup>
      <ButtonGroup orientation="vertical">
        <Button variant="outline">French</Button>
        <Button variant="outline">German</Button>
        <Button variant="outline">Japanese</Button>
      </ButtonGroup>
      <ButtonGroup>
        <ButtonGroupText>Locales</ButtonGroupText>
        <ButtonGroupSeparator />
        <Button variant="outline">12 selected</Button>
      </ButtonGroup>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Publish")).toBeInTheDocument();
  },
};
