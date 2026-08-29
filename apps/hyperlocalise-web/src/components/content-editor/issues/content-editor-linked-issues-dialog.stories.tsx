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
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "@/components/ui/button";

import {
  ContentEditorLinkedIssuesDialog,
  type ContentEditorLinkedIssueSegmentContext,
} from "./content-editor-linked-issues-dialog";
import {
  contentEditorLinkedIssuesEmptyMswHandlers,
  contentEditorLinkedIssuesErrorMswHandlers,
  contentEditorLinkedIssuesLoadingMswHandlers,
  contentEditorLinkedIssuesMswHandlers,
} from "./content-editor-linked-issues-dialog-msw-handlers";
import {
  contentEditorLinkedIssuesExternalSegmentFixture,
  contentEditorLinkedIssuesOrganizationSlug,
  contentEditorLinkedIssuesProjectId,
  contentEditorLinkedIssuesSegmentFixture,
} from "./content-editor-linked-issues-dialog.fixture";

function LinkedIssuesStoryHost({
  segment,
  initiallyOpen = true,
}: {
  segment: ContentEditorLinkedIssueSegmentContext;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <div className="flex min-h-[28rem] items-start justify-center bg-background p-8 text-foreground">
      <Button type="button" onClick={() => setOpen(true)}>
        Open linked issues
      </Button>
      <ContentEditorLinkedIssuesDialog
        open={open}
        onOpenChange={setOpen}
        organizationSlug={contentEditorLinkedIssuesOrganizationSlug}
        projectId={contentEditorLinkedIssuesProjectId}
        segment={segment}
      />
    </div>
  );
}

const meta = {
  title: "CAT/Linked Issues Dialog",
  component: LinkedIssuesStoryHost,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    segment: contentEditorLinkedIssuesSegmentFixture,
    initiallyOpen: true,
  },
} satisfies Meta<typeof LinkedIssuesStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLinkedIssues: Story = {
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Linked issues")).toBeInTheDocument();
    await waitFor(() =>
      expect(body.getByText("Context needed: home.cta.save")).toBeInTheDocument(),
    );
    await expect(body.getByText("Source wording feels ambiguous")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Create issue" })).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Link existing" })).toBeInTheDocument();
    await expect(body.getAllByRole("button", { name: "Unlink" })).toHaveLength(2);
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesEmptyMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByText("No issues linked to this string yet.")).toBeInTheDocument(),
    );
    await expect(body.getByRole("button", { name: "Create issue" })).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Link existing" })).toBeInTheDocument();
  },
};

export const LinkingUnavailable: Story = {
  args: {
    segment: contentEditorLinkedIssuesExternalSegmentFixture,
  },
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Linked issues")).toBeInTheDocument();
    await expect(body.getByText("Linking requires a native project string.")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Create issue" })).toBeInTheDocument();
    await expect(body.queryByRole("button", { name: "Link existing" })).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesLoadingMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Linked issues")).toBeInTheDocument();
    await expect(body.getByRole("button", { name: "Create issue" })).toBeInTheDocument();
    await expect(body.getByRole("status")).toBeInTheDocument();
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesErrorMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByText("Linked issues could not be loaded.")).toBeInTheDocument(),
    );
  },
};

export const CreateFromString: Story = {
  parameters: {
    msw: {
      handlers: contentEditorLinkedIssuesEmptyMswHandlers,
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByText("No issues linked to this string yet.")).toBeInTheDocument(),
    );

    await userEvent.click(body.getByRole("button", { name: "Create issue" }));
    await waitFor(() => expect(body.getByLabelText("Title")).toBeInTheDocument());
    await expect(body.getByDisplayValue(/Context needed: home.cta.save/i)).toBeInTheDocument();
  },
};
