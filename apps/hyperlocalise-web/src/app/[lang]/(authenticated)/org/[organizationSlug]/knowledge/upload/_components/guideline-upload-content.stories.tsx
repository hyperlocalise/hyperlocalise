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

import { emptyGuidelineUploadMswHandlers, guidelinePageWidthDecorator } from "../../_components/guideline-story-decorators";
import { GuidelineUploadContent } from "./guideline-upload-content";

const organizationSlug = "acme";

const meta = {
  title: "Guidelines/Upload page",
  component: GuidelineUploadContent,
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  decorators: [guidelinePageWidthDecorator],
  args: { organizationSlug },
} satisfies Meta<typeof GuidelineUploadContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizationUpload: Story = {
  args: { backHref: "/org/acme/knowledge" },
  parameters: { msw: { handlers: emptyGuidelineUploadMswHandlers() } },
};

export const ProjectPreselected: Story = {
  args: {
    initialProjectId: "project_1",
    backHref: "/org/acme/projects/project_1/knowledge",
  },
  parameters: { msw: { handlers: emptyGuidelineUploadMswHandlers() } },
};
