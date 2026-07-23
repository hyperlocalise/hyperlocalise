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
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";
import { Kbd } from "./kbd";

const meta = {
  title: "UI/Input Group",
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4 p-6">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <HugeiconsIcon icon={SearchIcon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search strings" placeholder="Search source strings" />
        <InputGroupAddon align="inline-end" className="gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Repository" defaultValue="github.com/acme/web" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Connect</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>Reviewer instructions</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea
          aria-label="Reviewer instructions"
          defaultValue="Preserve ICU placeholders."
        />
      </InputGroup>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Search strings")).toBeInTheDocument();
  },
};
