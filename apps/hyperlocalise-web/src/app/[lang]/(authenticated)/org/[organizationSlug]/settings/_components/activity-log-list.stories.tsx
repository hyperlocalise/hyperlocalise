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

import {
  V1_ACTIVITY_EVENT_TYPES,
  type V1ActivityEventType,
} from "@/lib/activity-log/activity-log-contract";

import { ActivityLogList, type ActivityLogItem } from "./activity-log-list";

const targetKindByEventType: Record<V1ActivityEventType, ActivityLogItem["target"]["kind"]> = {
  member_invited: "invitation",
  member_invite_resent: "invitation",
  member_role_changed: "membership",
  member_removed: "membership",
  workspace_updated: "organization",
  personal_access_token_created: "personal_access_token",
  personal_access_token_revoked: "personal_access_token",
  integration_connected: "integration",
  integration_disconnected: "integration",
  project_created: "project",
  project_archived: "project",
  project_deleted: "project",
  project_settings_changed: "project",
  glossary_created: "glossary",
  glossary_deleted: "glossary",
  glossary_imported: "glossary",
  glossary_exported: "glossary",
  glossary_ownership_changed: "glossary",
  glossary_project_attached: "project",
  glossary_project_detached: "project",
  translation_memory_created: "translation_memory",
  translation_memory_deleted: "translation_memory",
  translation_memory_imported: "translation_memory",
  translation_memory_exported: "translation_memory",
  translation_memory_project_attached: "project",
  translation_memory_project_detached: "project",
};

const storyNow = new Date("2026-09-04T10:00:00.000Z").getTime();

const allCategoryActivityLogs: ActivityLogItem[] = V1_ACTIVITY_EVENT_TYPES.map(
  (eventType, index) => ({
    actor: {
      displayName: index % 3 === 0 ? "Story Book" : index % 3 === 1 ? "System" : "Translation bot",
      kind: index % 3 === 0 ? "user" : index % 3 === 1 ? "system" : "agent",
      userId: index % 3 === 0 ? "user_storybook" : null,
    },
    createdAt: new Date(storyNow - (index + 1) * 60 * 60 * 1000).toISOString(),
    eventType,
    id: `activity_${eventType}`,
    target: {
      displayName:
        eventType === "workspace_updated"
          ? "Hyperlocalise"
          : eventType.includes("project")
            ? "Website localization"
            : eventType.includes("glossary")
              ? "Product terminology"
              : eventType.includes("translation_memory")
                ? "Approved translations"
                : eventType.includes("integration")
                  ? "GitHub"
                  : eventType.includes("token")
                    ? "Production access"
                    : "Alex Johnson",
      href: "/settings",
      kind: targetKindByEventType[eventType],
    },
  }),
);

const meta = {
  title: "App/Settings/Activity Log List",
  component: ActivityLogList,
  parameters: {
    layout: "padded",
  },
  args: {
    activityLogs: allCategoryActivityLogs,
    now: storyNow,
  },
} satisfies Meta<typeof ActivityLogList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllEventCategories: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/invited a member/)).toBeInTheDocument();
    await expect(canvas.getByText(/updated workspace settings/)).toBeInTheDocument();
    await expect(canvas.getByText(/created a personal access token/)).toBeInTheDocument();
    await expect(canvas.getByText(/connected an integration/)).toBeInTheDocument();
    await expect(canvas.getByText(/created a project/)).toBeInTheDocument();
    await expect(canvas.getByText(/created a glossary/)).toBeInTheDocument();
    await expect(canvas.getByText(/created translation memory/)).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(26);
  },
};
