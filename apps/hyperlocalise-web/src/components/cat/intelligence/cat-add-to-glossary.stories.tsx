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
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { CatAddToGlossary } from "./cat-add-to-glossary";

const teamProductId = "team-product";
const teamMarketingId = "team-marketing";

const meta = {
  title: "CAT/Add to Team Glossary",
  component: CatAddToGlossary,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-md text-foreground">
        <Story />
      </div>
    ),
  ],
  args: {
    organizationSlug: "acme",
    projectId: "project_1",
    teamId: teamProductId,
    teamName: "Product",
    sourceLocale: "en",
    targetLocale: "vi",
    sourceTerm: "Dashboard",
    targetTerm: "Bảng điều khiển",
    canContribute: true,
    teamGlossaries: [
      { id: "glossary-team-1", name: "Product team terms", teamId: teamProductId },
      { id: "glossary-team-2", name: "Marketing team terms", teamId: teamMarketingId },
    ],
    onAdded: fn(),
    onTeamGlossaryCreated: fn(),
  },
} satisfies Meta<typeof CatAddToGlossary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Picker: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    await expect(canvas.getByText("Shared with Product.")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Primary term" })).toHaveValue("Dashboard");
    await expect(canvas.getByRole("textbox", { name: "Definition" })).toHaveValue("");
    await expect(canvas.getByRole("checkbox", { name: "Translatable" })).toBeChecked();
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toHaveTextContent(
      "Product team terms",
    );
    await expect(canvas.getAllByRole("combobox").length).toBeGreaterThan(1);
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeEnabled();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Team glossary" }));
    await expect(
      await body.findByRole("option", { name: "Marketing team terms" }),
    ).not.toBeInTheDocument();
    await expect(body.getByRole("option", { name: "Create new" })).toBeInTheDocument();
  },
};

export const SingleTeamGlossary: Story = {
  args: {
    teamGlossaries: [{ id: "glossary-team-1", name: "Product team terms", teamId: teamProductId }],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    await expect(canvas.getByText("Shared with Product.")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toHaveTextContent(
      "Product team terms",
    );
    await expect(canvas.getByRole("textbox", { name: "Primary term" })).toHaveValue("Dashboard");
    await expect(canvas.getByRole("textbox", { name: "Target term" })).toHaveValue(
      "Bảng điều khiển",
    );
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeEnabled();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Team glossary" }));
    await expect(await body.findByRole("option", { name: "Create new" })).toBeInTheDocument();
  },
};

export const Untranslatable: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("checkbox", { name: "Translatable" })).toBeChecked();
    await expect(canvas.getByRole("textbox", { name: "Target term" })).toHaveValue(
      "Bảng điều khiển",
    );
    const metadataComboboxCount = canvas.getAllByRole("combobox").length;
    await userEvent.click(canvas.getByRole("checkbox", { name: "Translatable" }));
    await expect(canvas.getByRole("checkbox", { name: "Translatable" })).not.toBeChecked();
    await expect(canvas.queryByRole("textbox", { name: "Target term" })).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("combobox").length).toBeLessThan(metadataComboboxCount);
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeEnabled();
  },
};

export const CreateNew: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Team glossary" }));
    await userEvent.click(await body.findByRole("option", { name: "Create new" }));
    await expect(canvas.getByRole("textbox", { name: "Glossary name" })).toHaveValue(
      "Shared with Product.",
    );
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByRole("combobox", { name: "Team glossary" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    teamGlossaries: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    await expect(canvas.getByText("Shared with Product.")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Glossary name" })).toHaveValue(
      "Shared with Product.",
    );
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  },
};

function SegmentRemountDemo({
  initialSegmentId,
  nextSegmentId,
  sourceTerm,
  targetTerm,
}: {
  initialSegmentId: string;
  nextSegmentId: string;
  sourceTerm: string;
  targetTerm: string;
}) {
  const [segmentId, setSegmentId] = useState(initialSegmentId);

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setSegmentId(nextSegmentId)}>
        Switch segment
      </button>
      <CatAddToGlossary
        key={segmentId}
        organizationSlug="acme"
        projectId="project_1"
        teamId={teamProductId}
        teamName="Product"
        sourceLocale="en"
        targetLocale="vi"
        sourceTerm={sourceTerm}
        targetTerm={targetTerm}
        teamGlossaries={[
          { id: "glossary-team-1", name: "Product team terms", teamId: teamProductId },
        ]}
        canContribute
        onAdded={fn()}
      />
    </div>
  );
}

export const ResetsDraftsOnSegmentChange: Story = {
  render: () => (
    <SegmentRemountDemo
      initialSegmentId="seg-1"
      nextSegmentId="seg-2"
      sourceTerm="Dashboard"
      targetTerm="Bảng điều khiển"
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const definition = canvas.getByRole("textbox", { name: "Definition" });
    await userEvent.type(definition, "Keep this segment-specific");
    await expect(definition).toHaveValue("Keep this segment-specific");
    await userEvent.click(canvas.getByRole("button", { name: "Switch segment" }));
    await expect(canvas.getByRole("textbox", { name: "Definition" })).toHaveValue("");
    await expect(canvas.getByRole("textbox", { name: "Primary term" })).toHaveValue("Dashboard");
  },
};
