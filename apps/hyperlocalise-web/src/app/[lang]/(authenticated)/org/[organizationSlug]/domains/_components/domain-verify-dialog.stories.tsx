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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { DomainVerifyDialog } from "./domain-verify-dialog";
const meta = {
  title: "App/Domains/Verify Dialog",
  component: DomainVerifyDialog,
  args: { open: true, onOpenChange: () => {}, domainKey: "help.acme.com" },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <DomainVerifyDialog {...args} open={open} onOpenChange={setOpen} />
      </>
    );
  },
} satisfies Meta<typeof DomainVerifyDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
