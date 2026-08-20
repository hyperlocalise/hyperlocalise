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
import { expect, fn, userEvent, within } from "storybook/test";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { IssueSheetColumnIconId } from "@/lib/projects/issue-sheet/issue-sheet-column-icons";

import { IssueColumnIconPicker } from "./issue-column-icon-picker";

function PickerStory({
  initialValue = null,
  allowClear = true,
  disabled = false,
  withLabel = false,
  onChange = fn(),
}: {
  initialValue?: string | null;
  allowClear?: boolean;
  disabled?: boolean;
  withLabel?: boolean;
  onChange?: (icon: IssueSheetColumnIconId | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  const picker = (
    <IssueColumnIconPicker
      value={value}
      allowClear={allowClear}
      disabled={disabled}
      onChange={(icon) => {
        onChange(icon);
        setValue(icon);
      }}
    />
  );

  if (!withLabel) {
    return picker;
  }

  return (
    <div className="w-80">
      <FieldGroup className="flex-row items-start gap-3">
        <div className="flex shrink-0 flex-col items-start gap-1.5">
          <FieldLabel>Icon</FieldLabel>
          {picker}
        </div>
        <Field className="min-w-0 flex-1 gap-1.5">
          <FieldLabel htmlFor="story-column-label">Label</FieldLabel>
          <Input id="story-column-label" placeholder="Column label, e.g. Sprint" />
        </Field>
      </FieldGroup>
    </div>
  );
}

const meta = {
  title: "App/Issues/Column Icon Picker",
  component: PickerStory,
  parameters: {
    layout: "centered",
  },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof PickerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BesideLabel: Story = {
  args: {
    withLabel: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Choose column icon" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Label" })).toBeInTheDocument();
  },
};

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Choose column icon" })).toBeInTheDocument();
  },
};

export const OpenGrid: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Choose column icon" }));
    await expect(body.getByText("Choose icon")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "calendar" })).toBeInTheDocument();
  },
};

export const Search: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Choose column icon" }));
    await userEvent.type(body.getByRole("textbox", { name: "Search icons" }), "rocket");
    await expect(body.getByRole("button", { name: "rocket" })).toBeInTheDocument();
    await expect(body.queryByRole("button", { name: "calendar" })).not.toBeInTheDocument();
  },
};

export const SelectIcon: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Choose column icon" }));
    await userEvent.click(body.getByRole("button", { name: "calendar" }));
    await expect(args.onChange).toHaveBeenCalledWith("calendar");
  },
};

export const ClearToDefault: Story = {
  args: {
    initialValue: "bug",
  },
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Choose column icon" }));
    await userEvent.click(body.getByRole("button", { name: "Use default" }));
    await expect(args.onChange).toHaveBeenCalledWith(null);
  },
};
