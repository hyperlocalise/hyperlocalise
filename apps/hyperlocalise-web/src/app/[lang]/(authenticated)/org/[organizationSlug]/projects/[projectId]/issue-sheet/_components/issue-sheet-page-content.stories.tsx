import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  issueSheetEmptyMswHandlers,
  issueSheetErrorMswHandlers,
  issueSheetLoadingMswHandlers,
  issueSheetMswHandlers,
} from "./issue-sheet-msw-handlers";
import { issueSheetOrganizationSlug, issueSheetProjectId } from "./issue-sheet.fixture";
import { IssueSheetPageContent } from "./issue-sheet-page-content";

const meta = {
  title: "App/Project/Issue Sheet/Page",
  component: IssueSheetPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/org/${issueSheetOrganizationSlug}/projects/${issueSheetProjectId}/issue-sheet`,
      },
    },
  },
  args: {
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
  },
} satisfies Meta<typeof IssueSheetPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Issue Sheet")).toBeInTheDocument();
    await expect(canvas.getByText("Source string needs context")).toBeInTheDocument();
    await expect(canvas.getByText("3 total")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Issue" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Column" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: issueSheetLoadingMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Issue Sheet")).toBeInTheDocument();
    await expect(canvas.getByText("Loading issues...")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: issueSheetEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No issues in this view.")).toBeInTheDocument();
    await expect(
      canvas.getByText("Add an issue manually or from CAT to start tracking team context."),
    ).toBeInTheDocument();
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: issueSheetErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Issue Sheet")).toBeInTheDocument();
    await expect(canvas.getByText("Issues could not be loaded.")).toBeInTheDocument();
    await expect(canvas.queryByText("No issues in this view.")).not.toBeInTheDocument();
  },
};
