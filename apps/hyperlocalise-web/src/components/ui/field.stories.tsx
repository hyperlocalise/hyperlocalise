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

import { Input } from "./input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "./field";

const meta = {
  title: "UI/Field",
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <FieldGroup className="max-w-md p-6">
      <FieldSet>
        <FieldLegend>Localization settings</FieldLegend>
        <Field>
          <FieldLabel htmlFor="project">Project name</FieldLabel>
          <Input id="project" defaultValue="Mobile checkout" />
          <FieldDescription>Visible to reviewers and provider sync jobs.</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Require reviewer approval</FieldTitle>
            <FieldDescription>Block exports until at least one reviewer approves.</FieldDescription>
          </FieldContent>
        </Field>
        <FieldSeparator>or</FieldSeparator>
        <Field data-invalid>
          <FieldLabel htmlFor="slug">Project slug</FieldLabel>
          <Input id="slug" aria-invalid defaultValue="mobile checkout" />
          <FieldError>Use lowercase letters, numbers, and hyphens only.</FieldError>
        </Field>
      </FieldSet>
    </FieldGroup>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Localization settings")).toBeInTheDocument();
  },
};
