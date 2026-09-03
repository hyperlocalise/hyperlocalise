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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Default</h2>
        <div className="flex flex-col gap-4">
          <Input aria-label="Project name" placeholder="Marketing site" />
          <Input aria-label="Repository URL" defaultValue="github.com/acme/web" />
          <Input aria-invalid aria-label="Provider token" defaultValue="expired-token" />
          <Input aria-label="Locked slug" disabled defaultValue="production-workspace" />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Inline</h2>
        <div className="flex flex-col gap-4">
          <Input variant="inline" aria-label="Workflow name" defaultValue="Locale QA" />
          <Input variant="inline" aria-label="Issue field" placeholder="Add a value" />
          <Input
            variant="inline"
            aria-invalid
            aria-label="Invalid issue field"
            defaultValue="expired-token"
          />
          <Input
            variant="inline"
            aria-label="Locked issue field"
            disabled
            defaultValue="production-workspace"
          />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText("Project name");
    await userEvent.type(input, "Mobile app");
    await expect(input).toHaveValue("Mobile app");
    await expect(canvas.getByLabelText("Workflow name")).toHaveAttribute("data-variant", "inline");
  },
};
