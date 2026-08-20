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
import { expect, within } from "storybook/test";

import { IssueRelationshipSection } from "./issue-relationship-section";
import type { IssueRelationship } from "./use-issue-relationships-query";

const organizationSlug = "acme";
const projectId = "project_website";
const issueId = "issue_001";

function relationship(
  presentedKind: IssueRelationship["presentedKind"],
  id: string,
  title: string,
  status = "open",
): IssueRelationship {
  return {
    id,
    presentedKind,
    otherIssue: { issueId: `${id}_target`, projectId, title, status },
    createdAt: "2026-06-07T12:00:00.000Z",
  };
}

const allKinds: IssueRelationship[] = [
  relationship("blocks", "rel_blocks", "Blocked issue"),
  relationship("blocked_by", "rel_blocked_by", "Blocking issue", "resolved"),
  relationship("related", "rel_related", "Related issue"),
  relationship("duplicate_of", "rel_duplicate_of", "Canonical issue", "resolved"),
  relationship("duplicate", "rel_duplicate", "Duplicate issue"),
];

const meta = {
  title: "App/Issue Detail/Relationship Section",
  component: IssueRelationshipSection,
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "centered" },
  args: {
    organizationSlug,
    projectId,
    issueId,
    relationships: [],
  },
} satisfies Meta<typeof IssueRelationshipSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllKinds: Story = {
  args: { relationships: allKinds },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Blocks")).toBeInTheDocument();
    await expect(canvas.getByText("Blocked by")).toBeInTheDocument();
    await expect(canvas.getByText("Related")).toBeInTheDocument();
    await expect(canvas.getByText("Duplicate of")).toBeInTheDocument();
    await expect(canvas.getByText("Duplicates")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No relationships yet")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("No relationships yet")).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: { isError: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Could not load relationships")).toBeInTheDocument();
  },
};
