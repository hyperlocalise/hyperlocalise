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

import { IssueLocalePicker } from "./issue-locale-picker";

const projectLocales = ["fr-FR", "de-DE", "es-ES"];

function PickerStory({
  initialValue = null,
  locales = projectLocales,
  allowAny = false,
  allowClear = false,
  onValueChange = fn(),
}: {
  initialValue?: string | null;
  locales?: string[];
  allowAny?: boolean;
  allowClear?: boolean;
  onValueChange?: (locale: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initialValue);

  return (
    <div className="w-72">
      <IssueLocalePicker
        value={value}
        locales={locales}
        allowAny={allowAny}
        allowClear={allowClear}
        onValueChange={(locale) => {
          onValueChange(locale);
          setValue(locale);
        }}
      />
    </div>
  );
}

const meta = {
  title: "App/Issues/Locale Picker",
  component: PickerStory,
  parameters: {
    layout: "centered",
  },
  args: {
    onValueChange: fn(),
  },
} satisfies Meta<typeof PickerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FilterAnyLocale: Story = {
  args: {
    allowAny: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Select locale" })).toHaveTextContent(
      "Any locale",
    );
  },
};

export const FilterSelectLocale: Story = {
  args: {
    allowAny: true,
  },
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Select locale" }));
    await userEvent.click(await body.findByRole("option", { name: /German \(Germany\)/i }));
    await expect(args.onValueChange).toHaveBeenCalledWith("de-DE");
    await expect(canvas.getByRole("combobox", { name: "Select locale" })).toHaveTextContent(
      "German (Germany)",
    );
  },
};

export const CreateClearable: Story = {
  args: {
    allowClear: true,
    initialValue: "fr-FR",
  },
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("combobox", { name: "Select locale" })).toHaveTextContent(
      "French (France)",
    );
    await userEvent.click(canvas.getByRole("combobox", { name: "Select locale" }));
    await userEvent.click(await body.findByRole("option", { name: "No locale" }));
    await expect(args.onValueChange).toHaveBeenCalledWith(null);
  },
};

export const EmptyProjectLocales: Story = {
  args: {
    allowClear: true,
    locales: [],
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Select locale" }));
    await expect(body.getByText("No project locales configured")).toBeInTheDocument();
  },
};
