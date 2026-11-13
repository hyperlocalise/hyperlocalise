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

import { UploadDropzone } from "./upload-dropzone";

const meta = {
  title: "UI/UploadDropzone",
  component: UploadDropzone,
  args: {
    onUpload: async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 900);
      });
    },
  },
  decorators: [
    (Story) => (
      <div className="flex justify-center bg-muted p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UploadDropzone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Drag a file here" })).toBeInTheDocument();
    await expect(canvas.getByText("Up to 5 MB")).toBeInTheDocument();
  },
};

export const VisualContext: Story = {
  args: {
    wide: true,
    accept: "image/png,image/jpeg,image/webp",
    maxMb: 10,
    idleTitle: "Drag a screenshot here",
    dropTitle: "Drop to upload",
    hint: "PNG, JPEG, or WebP · up to 10 MB",
    tooBigTitle: "Screenshots must be 10 MB or smaller.",
    invalidTitle: "Screenshots must be PNG, JPEG, or WebP.",
    failedTitle: "Failed to upload screenshot.",
  },
  decorators: [
    (Story) => (
      <div className="w-[320px] rounded-xl border border-border bg-background p-3.5">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Drag a screenshot here" }),
    ).toBeInTheDocument();
  },
};

export const Compact: Story = {
  args: {
    ...VisualContext.args,
    compact: true,
  },
  decorators: VisualContext.decorators,
};
